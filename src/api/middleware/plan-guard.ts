/**
 * Plan Guard Middleware — Firestore-only desde Sprint 3.7
 *
 * Verifica se o tenant pode criar um novo job consultando os créditos
 * em `tenants/{tenantId}.credits` (Firestore via `firestore-billing.ts`).
 * Substitui o caminho legado que lia `bookagent_job_meta` no Supabase.
 *
 * Integração:
 *   - Registrado na rota POST /api/v1/process antes do controller
 *   - Lê tenantId/userId do `req.tenantContext` (populado por `tenantGuard`)
 *   - Fallback: header `X-User-Id` ou `req.body.user_context.whatsapp` em
 *     chamadas legacy/internas sem auth Firebase
 *   - Passa req.resolvedUserId / req.resolvedPlanTier pro controller
 *
 * Comportamento na ausência de tenant Firestore:
 *   - Tenant ainda não criado → permitido (novo user vai criar via consume)
 *   - Tenant existe + sem saldo → 402 PLAN_LIMIT_REACHED
 */

import type { Request, Response, NextFunction } from 'express';
import { getPlan, type PlanTier } from '../../plans/plan-config.js';
import { sendError } from '../helpers/response.js';
import { logger } from '../../utils/logger.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { isAdmin } from '../../modules/billing/admin-bypass.js';
import { checkJobAllowed } from '../../modules/billing/firestore-billing.js';
import { logDeprecatedSupabaseCall } from '../../utils/deprecated-supabase.js';

// ============================================================================
// Compat shim — composition root ainda chama setPlanGuardSupabaseClient.
// Mantemos como no-op pra não quebrar bootstrap.
// ============================================================================

export function setPlanGuardSupabaseClient(_client: SupabaseClient): void {
  logDeprecatedSupabaseCall({
    module: 'PlanGuardMiddleware',
    action: 'setPlanGuardSupabaseClient',
    reason: 'Plan-guard uses firestore-billing.checkJobAllowed since Sprint 3.7.',
  });
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

/** Extrai user_id do tenantContext (Firebase-first), header ou body. */
function resolveUserId(req: Request): string | null {
  // Firebase tenant context — fonte primária pós-Sprint-3.7
  const ctxUid = req.tenantContext?.userId;
  if (typeof ctxUid === 'string' && ctxUid.trim() && ctxUid !== 'anonymous') {
    return ctxUid.trim();
  }

  // Header explícito (n8n / API interna)
  const header = req.headers['x-user-id'];
  if (typeof header === 'string' && header.trim()) return header.trim();

  // Body legacy: user_context.whatsapp como identificador no canal WhatsApp
  const uc = req.body?.user_context;
  if (uc?.whatsapp) return String(uc.whatsapp);
  if (uc?.name) return String(uc.name);

  return null;
}

/** Resolve tenantId — prioriza tenantContext, fallback pra userId (solo tenant). */
function resolveTenantId(req: Request, userId: string): string {
  return req.tenantContext?.tenantId ?? userId;
}

/** Resolve plan tier do tenantContext ou header. Default starter. */
function resolvePlanTier(req: Request): PlanTier {
  const fromCtx = req.tenantContext?.planTier;
  if (fromCtx === 'pro' || fromCtx === 'agency' || fromCtx === 'starter') return fromCtx;

  const header = req.headers['x-plan-type'];
  if (typeof header === 'string') {
    const tier = header as PlanTier;
    if (tier === 'pro' || tier === 'agency' || tier === 'starter') return tier;
  }
  return 'starter';
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * planGuard — verifica limites do plano via Firestore antes de iniciar um job.
 *
 * Responde 402 (limite mensal atingido) ou 429 (concurrent — não enforced
 * desde Sprint 3.7; Firestore credits transactional já previne overrun).
 * Sem user_id identificável: passa sem bloqueio (compatibilidade legacy).
 */
export async function planGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = resolveUserId(req);

  if (!userId) {
    next();
    return;
  }

  // Admin bypass — DB8 team / founder can create jobs without plan limits
  if (isAdmin({ userId, email: req.authUser?.email })) {
    req.resolvedUserId = userId;
    req.resolvedPlanTier = 'agency';
    logger.debug(`[PlanGuard] Admin bypass for user=${userId}`);
    next();
    return;
  }

  const tenantId = resolveTenantId(req, userId);
  const tier = resolvePlanTier(req);
  const plan = getPlan(tier);

  // Check via Firestore — `tenants/{tenantId}.credits.jobsUsed/jobsLimit`.
  // Se o tenant ainda não existe (primeira chamada), check retorna allowed=false
  // com reason='Tenant não encontrado'. Tratamos como "permitido" pra novos
  // users — o consumeJobCredit no job-processor cria o tenant lazy.
  let check;
  try {
    check = await checkJobAllowed(tenantId, 1);
  } catch (err) {
    logger.warn(`[PlanGuard] Firestore check failed for tenant=${tenantId}: ${err}`);
    // Fail-open: se Firestore estiver instável, deixa passar — consume*
    // ainda é transacional e não passa do limite real.
    req.resolvedUserId = userId;
    req.resolvedPlanTier = tier;
    next();
    return;
  }

  // Tenant não encontrado = primeiro job desse user. Permitido.
  if (!check.allowed && check.reason?.includes('não encontrado')) {
    logger.debug(`[PlanGuard] tenant=${tenantId} new (not found yet) — allowing first job`);
    req.resolvedUserId = userId;
    req.resolvedPlanTier = tier;
    next();
    return;
  }

  if (!check.allowed) {
    logger.warn(
      `[PlanGuard] Limite atingido tenant=${tenantId} plan=${tier} ` +
      `(${check.used}/${check.limit} jobs)`,
    );
    sendError(
      res,
      'PLAN_LIMIT_REACHED',
      `Limite de ${plan.limits.jobsPerMonth} jobs/mês atingido para o plano ${plan.name}. ` +
      `Faça upgrade para continuar.`,
      402,
      { jobsUsed: check.used, limit: check.limit, planTier: tier, resetAt: check.resetAt },
    );
    return;
  }

  req.resolvedUserId = userId;
  req.resolvedPlanTier = tier;

  logger.debug(
    `[PlanGuard] tenant=${tenantId} plan=${tier} jobs=${check.used}/${check.limit}`,
  );

  next();
}
