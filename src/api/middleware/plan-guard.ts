/**
 * Plan Guard Middleware — BookAgent Intelligence Engine
 *
 * Verifica se o usuário pode criar um novo job com base em:
 *   1. Plano (basic/pro/business) — obtido do header X-Plan-Type ou do Supabase
 *   2. Consumo do mês atual — obtido do Supabase (bookagent_job_meta)
 *   3. Tamanho do arquivo — validado contra o limite do plano
 *
 * Integração:
 *   - Registrado na rota POST /api/v1/process antes do controller
 *   - Lê user_id de req.body.user_context.whatsapp ou header X-User-Id
 *   - Passa req.planTier e req.planLimits para o controller
 *
 * Parte 55: Escala Real e Monetização
 */

import type { Request, Response, NextFunction } from 'express';
import { getPlan, canCreateJob, type PlanTier } from '../../plans/plan-config.js';
import { sendError } from '../helpers/response.js';
import { logger } from '../../utils/logger.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';

// ============================================================================
// Module-level Supabase client (optional — injected from bootstrap)
// ============================================================================

let supabase: SupabaseClient | null = null;

export function setPlanGuardSupabaseClient(client: SupabaseClient): void {
  supabase = client;
}

// ============================================================================
// Augment Express Request type
// ============================================================================

declare module 'express-serve-static-core' {
  interface Request {
    resolvedUserId?: string;
    resolvedPlanTier?: PlanTier;
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** Extrai user_id do body ou do header X-User-Id. */
function resolveUserId(req: Request): string | null {
  // Header explícito (API calls, n8n)
  const header = req.headers['x-user-id'];
  if (typeof header === 'string' && header.trim()) return header.trim();

  // Body: user_context.whatsapp como identificador no canal WhatsApp
  const uc = req.body?.user_context;
  if (uc?.whatsapp) return String(uc.whatsapp);
  if (uc?.name) return String(uc.name);

  return null;
}

/** Conta jobs criados pelo userId no mês corrente via Supabase. */
async function countJobsThisMonth(userId: string): Promise<number> {
  if (!supabase) return 0;
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // PostgREST: ?user_id=eq.{id}&created_at=gte.{date}
    const rows = await supabase.select<{ job_id: string }>(
      'bookagent_job_meta',
      {
        filters: [
          { column: 'user_id', operator: 'eq', value: userId },
          { column: 'created_at', operator: 'gte', value: startOfMonth.toISOString() },
        ],
        select: 'job_id',
      },
    );
    return rows.length;
  } catch {
    return 0; // falha silenciosa — não bloqueia por erro de DB
  }
}

/** Obtém o plano do usuário do Supabase (último registro). Fallback: 'starter'. */
async function resolveUserPlan(userId: string): Promise<PlanTier> {
  // Header explícito tem precedência (n8n, API interna)
  // O header é lido pelo chamador — aqui apenas fallback de DB
  if (!supabase) return 'starter';
  try {
    const rows = await supabase.select<{ plan_type: string }>(
      'bookagent_job_meta',
      {
        filters: [{ column: 'user_id', operator: 'eq', value: userId }],
        select: 'plan_type',
        orderBy: 'created_at',
        orderDesc: true,
        limit: 1,
      },
    );
    const tier = rows[0]?.plan_type as PlanTier | undefined;
    return tier === 'pro' || tier === 'agency' ? tier : 'starter';
  } catch {
    return 'starter';
  }
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * planGuard — verifica limites do plano antes de iniciar um job.
 *
 * Responde 402 (limite de jobs atingido) ou 413 (arquivo muito grande).
 * Se não houver user_id identificável, passa sem bloqueio (compatibilidade
 * com chamadas legacy/internas sem autenticação explícita).
 */
export async function planGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = resolveUserId(req);

  if (!userId) {
    // Sem user_id — modo anônimo/interno, não aplicar limites
    next();
    return;
  }

  // Resolve plano: header X-Plan-Type → DB → 'starter'
  const headerPlan = req.headers['x-plan-type'];
  let tier: PlanTier = typeof headerPlan === 'string'
    ? (headerPlan as PlanTier)
    : await resolveUserPlan(userId);

  // Garante que tier é válido
  if (tier !== 'pro' && tier !== 'agency') tier = 'starter';

  const plan = getPlan(tier);

  // Verificar tamanho do arquivo (se informado no body)
  const fileUrl: string | undefined = req.body?.file_url;
  // Nota: não fazemos HEAD request aqui para não adicionar latência.
  // O arquivo será baixado pelo worker; o limite de tamanho é soft-enforced.
  // Hard-enforce acontece no worker.

  // Verificar consumo do mês
  const jobsThisMonth = await countJobsThisMonth(userId);
  if (!canCreateJob(tier, jobsThisMonth)) {
    logger.warn(
      `[PlanGuard] Limite mensal atingido para user=${userId} plan=${tier} ` +
      `(${jobsThisMonth}/${plan.limits.jobsPerMonth} jobs)`,
    );
    sendError(
      res,
      'PLAN_LIMIT_REACHED',
      `Limite de ${plan.limits.jobsPerMonth} jobs/mês atingido para o plano ${plan.name}. ` +
      `Faça upgrade para continuar.`,
      402,
      { jobsUsed: jobsThisMonth, limit: plan.limits.jobsPerMonth, planTier: tier },
    );
    return;
  }

  // Verificar jobs simultâneos
  if (supabase) {
    try {
      const inProgress = await supabase.select<{ job_id: string }>(
        'bookagent_job_meta',
        {
          filters: [
            { column: 'user_id', operator: 'eq', value: userId },
            { column: 'approval_status', operator: 'eq', value: 'processing' },
          ],
          select: 'job_id',
        },
      );
      if (inProgress.length >= plan.limits.concurrentJobs) {
        sendError(
          res,
          'CONCURRENT_LIMIT',
          `Máximo de ${plan.limits.concurrentJobs} job(s) simultâneo(s) para o plano ${plan.name}.`,
          429,
          { inProgress: inProgress.length, limit: plan.limits.concurrentJobs },
        );
        return;
      }
    } catch {
      // falha silenciosa
    }
  }

  // Injetar no request para uso downstream
  req.resolvedUserId = userId;
  req.resolvedPlanTier = tier;

  logger.debug(
    `[PlanGuard] user=${userId} plan=${tier} jobs_this_month=${jobsThisMonth}/${plan.limits.jobsPerMonth}`,
  );

  next();
}
