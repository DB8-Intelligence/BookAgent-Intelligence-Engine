/**
 * Tenant Resolver — Multi-Tenant Governance
 *
 * Camada utilitária para resolução, validação e gestão de tenant context.
 *
 * Responsabilidades:
 *   - Resolver tenant a partir de request (headers, body, DB)
 *   - Validar acesso do usuário ao tenant
 *   - Gerar TenantContext leve para pipeline/fila
 *   - Validar limites do plano
 *
 * Parte 74: Multi-Tenant Governance
 */

import type {
  TenantContext,
  TenantFeatureFlags,
  TenantLimits,
} from '../domain/entities/tenant.js';
import {
  TenantRole,
  LearningScope,
  PLAN_FEATURES,
  PLAN_TENANT_LIMITS,
} from '../domain/entities/tenant.js';
import type { PlanTier } from '../plans/plan-config.js';
import type { SupabaseClient } from '../persistence/supabase-client.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Default Tenant (backwards compatibility)
// ---------------------------------------------------------------------------

/** ID de tenant default para compatibilidade com fluxos sem tenant explícito */
export const DEFAULT_TENANT_ID = 'default';

/**
 * Cria um TenantContext default para compatibilidade retroativa.
 * Usado quando nenhum tenant é explicitamente fornecido.
 */
export function createDefaultTenantContext(
  userId?: string,
  planTier?: PlanTier,
): TenantContext {
  const tier = planTier ?? 'basic';

  return {
    tenantId: DEFAULT_TENANT_ID,
    userId: userId ?? 'anonymous',
    userRole: TenantRole.OWNER,
    planTier: tier,
    features: PLAN_FEATURES[tier],
    limits: PLAN_TENANT_LIMITS[tier],
    learningScope: PLAN_TENANT_LIMITS[tier].learningScope,
  };
}

// ---------------------------------------------------------------------------
// Resolve Tenant Context
// ---------------------------------------------------------------------------

export interface ResolveTenantInput {
  /** Header X-Tenant-Id */
  tenantIdHeader?: string;
  /** Header X-User-Id */
  userIdHeader?: string;
  /** Header X-Plan-Type */
  planTierHeader?: string;
  /** Body user_context fields */
  bodyUserContext?: {
    whatsapp?: string;
    name?: string;
  };
}

/**
 * Resolve TenantContext a partir de headers, body e DB.
 *
 * Prioridade de resolução:
 *   1. Header X-Tenant-Id → DB lookup
 *   2. Header X-User-Id → DB lookup (busca tenant do user)
 *   3. Body user_context.whatsapp → DB lookup
 *   4. Fallback: default tenant
 */
export async function resolveTenantContext(
  input: ResolveTenantInput,
  supabase: SupabaseClient | null,
): Promise<TenantContext> {
  // Resolve user ID
  const userId = input.userIdHeader
    ?? input.bodyUserContext?.whatsapp
    ?? input.bodyUserContext?.name
    ?? 'anonymous';

  // Resolve tenant ID
  let tenantId = input.tenantIdHeader ?? undefined;

  // If no explicit tenant, try to resolve from DB
  if (!tenantId && supabase && userId !== 'anonymous') {
    tenantId = await resolveTenantIdFromUser(userId, supabase);
  }

  // Resolve plan tier
  const planTier = resolvePlanTier(input.planTierHeader, tenantId, supabase);
  const tier = await planTier;

  // If no tenant found, use default
  if (!tenantId) {
    return createDefaultTenantContext(userId, tier);
  }

  return {
    tenantId,
    userId,
    userRole: TenantRole.MEMBER, // Default; overridden by DB lookup if available
    planTier: tier,
    features: PLAN_FEATURES[tier],
    limits: PLAN_TENANT_LIMITS[tier],
    learningScope: PLAN_TENANT_LIMITS[tier].learningScope,
  };
}

// ---------------------------------------------------------------------------
// Validate Access
// ---------------------------------------------------------------------------

/**
 * Valida que o tenant context tem acesso ao recurso especificado.
 */
export function validateTenantAccess(
  tenantContext: TenantContext,
  resourceTenantId: string,
): boolean {
  // Default tenant tem acesso a tudo (backwards compat)
  if (tenantContext.tenantId === DEFAULT_TENANT_ID) return true;

  // Tenant match
  return tenantContext.tenantId === resourceTenantId;
}

/**
 * Valida que o tenant tem a feature habilitada.
 */
export function validateFeature(
  tenantContext: TenantContext,
  feature: keyof TenantFeatureFlags,
): boolean {
  return tenantContext.features[feature] === true;
}

// ---------------------------------------------------------------------------
// Get Limits
// ---------------------------------------------------------------------------

/**
 * Retorna os limites operacionais do tenant.
 */
export function getTenantLimits(tenantContext: TenantContext): TenantLimits {
  return tenantContext.limits;
}

/**
 * Verifica se um limite específico foi atingido.
 */
export function checkLimit(
  tenantContext: TenantContext,
  limitKey: keyof TenantLimits,
  currentValue: number,
): { allowed: boolean; limit: number; current: number } {
  const limit = tenantContext.limits[limitKey];
  if (typeof limit !== 'number') {
    return { allowed: true, limit: 0, current: currentValue };
  }

  return {
    allowed: currentValue < limit,
    limit,
    current: currentValue,
  };
}

// ---------------------------------------------------------------------------
// Learning Scope
// ---------------------------------------------------------------------------

/**
 * Determina o escopo de learning para o tenant.
 */
export function getLearningScope(tenantContext: TenantContext): LearningScope {
  return tenantContext.learningScope;
}

/**
 * Verifica se o learning do tenant pode acessar dados globais.
 */
export function canAccessGlobalLearning(tenantContext: TenantContext): boolean {
  return tenantContext.learningScope === LearningScope.GLOBAL
    || tenantContext.learningScope === LearningScope.HYBRID;
}

/**
 * Verifica se o tenant tem dados de learning isolados.
 */
export function hasTenantLearning(tenantContext: TenantContext): boolean {
  return tenantContext.learningScope === LearningScope.TENANT
    || tenantContext.learningScope === LearningScope.HYBRID;
}

// ---------------------------------------------------------------------------
// DB Helpers
// ---------------------------------------------------------------------------

async function resolveTenantIdFromUser(
  userId: string,
  supabase: SupabaseClient,
): Promise<string | undefined> {
  try {
    const rows = await supabase.select<{ tenant_id: string }>(
      'bookagent_job_meta',
      {
        filters: [{ column: 'user_id', operator: 'eq', value: userId }],
        select: 'tenant_id',
        orderBy: 'created_at',
        orderDesc: true,
        limit: 1,
      },
    );

    return rows[0]?.tenant_id || undefined;
  } catch {
    return undefined;
  }
}

async function resolvePlanTier(
  headerTier: string | undefined,
  tenantId: string | undefined,
  supabase: SupabaseClient | null,
): Promise<PlanTier> {
  // Header override
  if (headerTier === 'pro' || headerTier === 'business') return headerTier;
  if (headerTier === 'basic') return 'basic';

  // DB lookup (fallback)
  if (tenantId && supabase) {
    try {
      const rows = await supabase.select<{ plan_type: string }>(
        'bookagent_job_meta',
        {
          filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
          select: 'plan_type',
          orderBy: 'created_at',
          orderDesc: true,
          limit: 1,
        },
      );
      const tier = rows[0]?.plan_type;
      if (tier === 'pro' || tier === 'business') return tier;
    } catch {
      // fallback
    }
  }

  return 'basic';
}
