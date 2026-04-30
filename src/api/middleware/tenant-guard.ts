/**
 * Tenant Guard Middleware — Firestore-only desde Sprint 3.7
 *
 * Resolve TenantContext em cada request baseado no authUser do Firebase.
 * Modelo solo-tenant: cada Firebase UID é seu próprio tenant
 * (`tenantId === uid`). Multi-user/agency tenant lookup foi removido.
 *
 * Headers lidos:
 *   - X-User-Id: ID do usuário em chamadas anônimas/internas (sem auth Firebase)
 *
 * Resultado:
 *   - req.tenantContext é populado em cada request
 *   - Consultas downstream usam tenantContext.tenantId para scoping
 */

import type { Request, Response, NextFunction } from 'express';
import type { TenantContext } from '../../domain/entities/tenant.js';
import {
  TenantRole,
  PLAN_FEATURES,
  PLAN_TENANT_LIMITS,
  LearningScope,
} from '../../domain/entities/tenant.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { logger } from '../../utils/logger.js';
import { logDeprecatedSupabaseCall } from '../../utils/deprecated-supabase.js';

// ============================================================================
// Augment Express Request type
// ============================================================================

declare module 'express-serve-static-core' {
  interface Request {
    tenantContext?: TenantContext;
  }
}

// ============================================================================
// Compat shim — composition root ainda chama setTenantGuardSupabaseClient.
// ============================================================================

export function setTenantGuardSupabaseClient(_client: SupabaseClient): void {
  logDeprecatedSupabaseCall({
    module: 'TenantGuardMiddleware',
    action: 'setTenantGuardSupabaseClient',
    reason: 'Tenant resolution is Firebase-uid-only since Sprint 3.7.',
  });
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * tenantGuard — resolve TenantContext e injeta no request.
 *
 * - Com Firebase Auth: tenantId = userId = authUser.id (solo tenant).
 * - Sem auth (chamadas anônimas/internas): default context (tenantId='default').
 *
 * Não bloqueia requests sem tenant — backwards compat. Para enforcement
 * estrito, controllers devem checar `tenantContext.tenantId !== 'default'`.
 */
export async function tenantGuard(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.authUser?.id) {
    const tier: 'starter' = 'starter';
    req.tenantContext = {
      tenantId: req.authUser.id,
      userId: req.authUser.id,
      userRole: TenantRole.OWNER,
      planTier: tier,
      features: PLAN_FEATURES[tier],
      limits: PLAN_TENANT_LIMITS[tier],
      learningScope: LearningScope.TENANT,
    };
    logger.debug(`[TenantGuard] firebase-uid tenant=${req.authUser.id}`);
    next();
    return;
  }

  // Sem authUser — default tenant (anonymous/internal calls).
  // Pipeline interno e webhooks que ainda dependem de tenantContext recebem
  // um shape válido mas com tenantId='default' — controllers devem decidir
  // se aceitam essa identidade.
  req.tenantContext = createDefaultTenantContext();
  next();
}

/**
 * tenantScopeValidator — valida ownership de jobId vs tenant atual.
 *
 * Sprint 3.7: a validação Supabase (`bookagent_job_meta.tenant_id`) foi
 * removida porque a tabela legada está sendo deprecada. Validação por
 * Firestore (`jobs/{jobId}.tenantId`) será adicionada em Sprint 3.8 quando
 * o cutover de leitura de jobs for feito. Por enquanto, este middleware
 * passa requests sem validação cross-tenant.
 *
 * NOTA DE SEGURANÇA: até essa validação voltar, qualquer user autenticado
 * que conheça um jobId pode acessá-lo. Mitigação parcial: jobIds são UUID v4
 * (não-enumeráveis). Endpoints sensíveis devem validar ownership manualmente.
 */
export function tenantScopeValidator(_jobIdParam: string = 'jobId') {
  return async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // No-op até cutover Firestore de jobs (Sprint 3.8+).
    next();
  };
}
