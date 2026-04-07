/**
 * Tenant Guard Middleware — Multi-Tenant Governance
 *
 * Resolve e injeta TenantContext em cada request.
 * Valida isolamento: impede acesso cruzado entre tenants.
 *
 * Headers lidos:
 *   - X-Tenant-Id: ID do tenant (opcional, resolvido automaticamente)
 *   - X-User-Id: ID do usuário
 *   - X-Plan-Type: Tier do plano (override)
 *
 * Resultado:
 *   - req.tenantContext é populado em cada request
 *   - Consultas downstream usam tenantContext.tenantId para scoping
 *
 * Parte 74: Multi-Tenant Governance
 */

import type { Request, Response, NextFunction } from 'express';
import type { TenantContext } from '../../domain/entities/tenant.js';
import {
  resolveTenantContext,
  createDefaultTenantContext,
} from '../../core/tenant-resolver.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Augment Express Request type
// ============================================================================

declare module 'express-serve-static-core' {
  interface Request {
    tenantContext?: TenantContext;
  }
}

// ============================================================================
// Module-level Supabase client
// ============================================================================

let supabase: SupabaseClient | null = null;

export function setTenantGuardSupabaseClient(client: SupabaseClient): void {
  supabase = client;
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * tenantGuard — resolve TenantContext e injeta no request.
 *
 * Não bloqueia requests sem tenant (backwards compatibility).
 * Para bloquear, use tenantGuardStrict.
 */
export async function tenantGuard(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantContext = await resolveTenantContext(
      {
        tenantIdHeader: asString(req.headers['x-tenant-id']),
        userIdHeader: asString(req.headers['x-user-id']),
        planTierHeader: asString(req.headers['x-plan-type']),
        bodyUserContext: req.body?.user_context,
      },
      supabase,
    );

    req.tenantContext = tenantContext;

    logger.debug(
      `[TenantGuard] tenant=${tenantContext.tenantId} ` +
      `user=${tenantContext.userId} plan=${tenantContext.planTier}`,
    );
  } catch (err) {
    // Fallback: create default context
    logger.warn(`[TenantGuard] Failed to resolve tenant: ${err}`);
    req.tenantContext = createDefaultTenantContext();
  }

  next();
}

/**
 * Cria um middleware que valida que o jobId/resource pertence ao tenant do request.
 * Usa o parâmetro de rota para extrair o jobId.
 */
export function tenantScopeValidator(jobIdParam: string = 'jobId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantCtx = req.tenantContext;
    if (!tenantCtx || tenantCtx.tenantId === 'default') {
      // No tenant enforcement for default/legacy
      next();
      return;
    }

    const jobId = req.params[jobIdParam];
    if (!jobId) {
      next();
      return;
    }

    // Validate job belongs to tenant
    if (supabase) {
      try {
        const rows = await supabase.select<{ tenant_id: string }>(
          'bookagent_job_meta',
          {
            filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
            select: 'tenant_id',
            limit: 1,
          },
        );

        const jobTenantId = rows[0]?.tenant_id;
        if (jobTenantId && jobTenantId !== tenantCtx.tenantId) {
          logger.warn(
            `[TenantGuard] Access denied: tenant=${tenantCtx.tenantId} ` +
            `tried to access job=${jobId} (owner=${jobTenantId})`,
          );
          res.status(403).json({
            success: false,
            error: { code: 'TENANT_ACCESS_DENIED', message: 'Acesso negado a este recurso.' },
          });
          return;
        }
      } catch {
        // Allow on DB failure (graceful degradation)
      }
    }

    next();
  };
}

// ============================================================================
// Helpers
// ============================================================================

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
