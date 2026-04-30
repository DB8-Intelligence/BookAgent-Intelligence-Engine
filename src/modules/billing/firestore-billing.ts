/**
 * Firestore Billing — créditos reais sobre o tenant (organização)
 *
 * Substitui o sistema legado baseado em bookagent_user_plans +
 * bookagent_monthly_usage + bookagent_usage_counters (Supabase Postgres).
 * Agora tudo vive em tenants/{tenantId}.credits — uma única leitura pra
 * renderizar CreditsCard + uma única transação pra consumir.
 *
 * Na MVP, cada user tem um solo tenant (tenantId = uid). Futuro: quando
 * user for invited pra um time, todos os membros compartilham os créditos
 * do tenant da organização — sem mudar esta API.
 *
 * Modelo de dados (em tenants/{tenantId}.credits):
 *   {
 *     jobsUsed:     number   // contador do período atual
 *     jobsLimit:    number   // limite derivado do planTier
 *     rendersUsed:  number
 *     rendersLimit: number
 *     periodStart:  ISO      // início do ciclo atual (rolling mensal)
 *     periodEnd:    ISO      // fim; quando now > periodEnd, reset ao consumir
 *   }
 *
 * Período: rolling de 30 dias a partir da criação ou do último reset.
 * Webhooks de pagamento (Kiwify/Hotmart/Stripe) chamam upgradePlan()
 * pra trocar tier + resetar os limites.
 *
 * Concorrência: consume* usam Firestore transaction — 2 requests paralelos
 * ao mesmo tenant nunca conseguem passar do limite.
 */

import { firestore, type Tenant } from '../../persistence/google-persistence.js';
import { PLAN_TENANT_LIMITS } from '../../domain/entities/tenant.js';
import { PLANS, type PlanTier } from '../../plans/plan-config.js';
import { logger } from '../../utils/logger.js';

const TENANTS = 'tenants';

// ---------------------------------------------------------------------------
// Plan limits — derivados de PLAN_TENANT_LIMITS (fonte de verdade)
// ---------------------------------------------------------------------------

export interface PlanLimits {
  jobsLimit: number;
  rendersLimit: number;
}

/**
 * Traduz o plan tier em { jobsLimit, rendersLimit } usados no dashboard.
 * rendersLimit derivado de jobsPerMonth * maxVideoRendersPerJob.
 */
export function planLimitsFor(tier: PlanTier): PlanLimits {
  const l = PLAN_TENANT_LIMITS[tier] ?? PLAN_TENANT_LIMITS.starter;
  return {
    jobsLimit: l.jobsPerMonth,
    rendersLimit: l.jobsPerMonth * Math.max(1, l.maxVideoRendersPerJob),
  };
}

// ---------------------------------------------------------------------------
// Domain errors
// ---------------------------------------------------------------------------

export class CreditLimitError extends Error {
  constructor(
    message: string,
    public readonly remaining: number,
    public readonly limit: number,
  ) {
    super(message);
    this.name = 'CreditLimitError';
  }
}

// ---------------------------------------------------------------------------
// Read-side — check sem side effect (usado por pre-flight UI / middleware)
// ---------------------------------------------------------------------------

export interface CreditCheck {
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
  resetAt: string;
  /** Razão quando allowed=false */
  reason?: string;
}

export async function checkJobAllowed(tenantId: string, count: number = 1): Promise<CreditCheck> {
  return readCheck(tenantId, 'jobs', count);
}

export async function checkRenderAllowed(tenantId: string, count: number = 1): Promise<CreditCheck> {
  return readCheck(tenantId, 'renders', count);
}

async function readCheck(
  tenantId: string,
  kind: 'jobs' | 'renders',
  count: number,
): Promise<CreditCheck> {
  const ref = firestore().collection(TENANTS).doc(tenantId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { allowed: false, remaining: 0, limit: 0, used: 0, resetAt: '', reason: 'Tenant não encontrado' };
  }
  const t = snap.data() as Tenant;

  // Aplica reset virtual (sem gravar) — o grava acontece em consume*
  const rolled = rolledCreditsView(t);

  const used = kind === 'jobs' ? rolled.jobsUsed : rolled.rendersUsed;
  const limit = kind === 'jobs' ? rolled.jobsLimit : rolled.rendersLimit;
  const remaining = Math.max(0, limit - used);
  const allowed = used + count <= limit;

  return {
    allowed,
    remaining,
    limit,
    used,
    resetAt: rolled.periodEnd,
    reason: allowed
      ? undefined
      : `Limite de ${kind === 'jobs' ? 'jobs' : 'renders'} atingido (${used}/${limit}).`,
  };
}

// ---------------------------------------------------------------------------
// Write-side — consume atômico via Firestore transaction
// ---------------------------------------------------------------------------

/**
 * Consome N créditos de job do tenant. Garante atomicidade: se falhar
 * (limite excedido), não incrementa nada. Aplica period reset inline
 * se o ciclo virou desde a última escrita.
 *
 * Lança CreditLimitError quando não há saldo.
 */
export async function consumeJobCredit(tenantId: string, count: number = 1): Promise<void> {
  await consumeCredit(tenantId, 'jobs', count);
}

export async function consumeRenderCredit(tenantId: string, count: number): Promise<void> {
  if (count <= 0) return;
  await consumeCredit(tenantId, 'renders', count);
}

async function consumeCredit(
  tenantId: string,
  kind: 'jobs' | 'renders',
  count: number,
): Promise<void> {
  const ref = firestore().collection(TENANTS).doc(tenantId);

  await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new Error(`[FirestoreBilling] Tenant ${tenantId} não existe`);
    }
    const t = snap.data() as Tenant;
    const rolled = rolledCreditsView(t);

    const usedField = kind === 'jobs' ? 'jobsUsed' : 'rendersUsed';
    const limitField = kind === 'jobs' ? 'jobsLimit' : 'rendersLimit';
    const used = rolled[usedField];
    const limit = rolled[limitField];

    if (used + count > limit) {
      throw new CreditLimitError(
        `Limite de ${kind} atingido: ${used}/${limit}`,
        Math.max(0, limit - used),
        limit,
      );
    }

    const patch: Record<string, unknown> = {
      [`credits.${usedField}`]: used + count,
      updatedAt: new Date().toISOString(),
    };
    // Se o view virtual rolou pro próximo período, persistimos o novo ciclo
    if (rolled.periodStart !== t.credits.periodStart) {
      patch['credits.periodStart'] = rolled.periodStart;
      patch['credits.periodEnd'] = rolled.periodEnd;
      const otherField = kind === 'jobs' ? 'rendersUsed' : 'jobsUsed';
      patch[`credits.${otherField}`] = 0;
    }
    tx.update(ref, patch);
  });
}

// ---------------------------------------------------------------------------
// Plan upgrade — chamado por webhooks de pagamento ou admin
// ---------------------------------------------------------------------------

/**
 * Troca o tier do tenant e aplica os novos limites. Preserva os contadores
 * usados (não reseta) — upgrade mid-period é benéfico pros membros.
 *
 * Pra reset forçado (início de novo ciclo após pagamento renovado), passe
 * resetPeriod=true.
 */
export async function upgradePlan(
  tenantId: string,
  newTier: PlanTier,
  opts: { resetPeriod?: boolean } = {},
): Promise<Tenant> {
  const ref = firestore().collection(TENANTS).doc(tenantId);
  const limits = planLimitsFor(newTier);
  const planName = PLANS[newTier]?.name ?? newTier;

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 30);

  const patch: Record<string, unknown> = {
    planTier: newTier,
    'credits.jobsLimit': limits.jobsLimit,
    'credits.rendersLimit': limits.rendersLimit,
    updatedAt: now.toISOString(),
  };
  if (opts.resetPeriod) {
    patch['credits.jobsUsed'] = 0;
    patch['credits.rendersUsed'] = 0;
    patch['credits.periodStart'] = now.toISOString();
    patch['credits.periodEnd'] = periodEnd.toISOString();
  }

  await ref.update(patch);
  logger.info(
    `[FirestoreBilling] upgrade tenant=${tenantId} → ${newTier} (${planName}), reset=${!!opts.resetPeriod}`,
  );

  const snap = await ref.get();
  return snap.data() as Tenant;
}

// ---------------------------------------------------------------------------
// Period rolling — virtual view (sem side effect)
// ---------------------------------------------------------------------------

/**
 * Retorna os créditos refletindo o ciclo ATUAL. Se o periodEnd expirou,
 * zera os contadores na view (mas não grava — quem grava é o próximo
 * consume* ou upgradePlan).
 */
function rolledCreditsView(t: Tenant): Tenant['credits'] {
  const now = new Date();
  const end = new Date(t.credits.periodEnd);
  if (now <= end) return t.credits;

  const newStart = now;
  const newEnd = new Date(newStart);
  newEnd.setDate(newEnd.getDate() + 30);

  return {
    ...t.credits,
    jobsUsed: 0,
    rendersUsed: 0,
    periodStart: newStart.toISOString(),
    periodEnd: newEnd.toISOString(),
  };
}

/**
 * Força persistir o period reset se o ciclo virou. Chamado pelo dashboard
 * antes de renderizar o overview — garante que os membros vêem os números
 * do novo ciclo mesmo sem ninguém ter consumido.
 */
export async function materializePeriodReset(tenantId: string): Promise<void> {
  const ref = firestore().collection(TENANTS).doc(tenantId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const t = snap.data() as Tenant;
  const rolled = rolledCreditsView(t);
  if (rolled.periodStart === t.credits.periodStart) return;

  await ref.update({
    'credits.jobsUsed': 0,
    'credits.rendersUsed': 0,
    'credits.periodStart': rolled.periodStart,
    'credits.periodEnd': rolled.periodEnd,
    updatedAt: new Date().toISOString(),
  });
  logger.info(`[FirestoreBilling] period reset tenant=${tenantId} → ${rolled.periodEnd}`);
}
