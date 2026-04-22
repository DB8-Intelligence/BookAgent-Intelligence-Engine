/**
 * Limit Checker — Billing & Usage Tracking
 *
 * Avalia limites de uso por plano e gera respostas de bloqueio/aviso.
 *
 * Comportamento ao atingir limite:
 *   - ALLOWED:          operação normal
 *   - WARNING (>80%):   operação permitida + alerta
 *   - BLOCKED (>=100%): operação bloqueada + sugestão de upgrade
 *   - FEATURE_DISABLED: feature não habilitada no plano
 *
 * Parte 75: Billing & Usage Tracking
 */

import type { TenantContext } from '../../domain/entities/tenant.js';
import type {
  FeatureUsage,
  UsageSummary,
  BillingPlanLimits,
} from '../../domain/entities/billing.js';
import {
  UsageEventType,
  LimitCheckResult,
  BILLING_PLAN_LIMITS,
  EVENT_TO_LIMIT_FIELD,
  EVENT_LABELS,
} from '../../domain/entities/billing.js';
import type { TenantFeatureFlags } from '../../domain/entities/tenant.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { logger } from '../../utils/logger.js';

import { getUsageCount, getAllUsageCounts, currentMonthKey } from './usage-meter.js';
import { isAdminUserId } from './admin-bypass.js';

// ---------------------------------------------------------------------------
// Feature → Event mapping (for feature flag check)
// ---------------------------------------------------------------------------

const EVENT_REQUIRES_FEATURE: Partial<Record<UsageEventType, keyof TenantFeatureFlags>> = {
  [UsageEventType.AUTO_PUBLISH_USED]: 'autoPublish',
  [UsageEventType.EXPERIMENT_CREATED]: 'abTesting',
  [UsageEventType.LEARNING_RULE_APPLIED]: 'learningEngine',
  [UsageEventType.VIDEO_RENDER_REQUESTED]: 'videoRender',
  [UsageEventType.THUMBNAIL_GENERATED]: 'thumbnailGeneration',
  [UsageEventType.BLOG_GENERATED]: 'blogGeneration',
  [UsageEventType.LANDING_PAGE_GENERATED]: 'landingPageGeneration',
  [UsageEventType.REVISION_REQUESTED]: 'revisionLoop',
};

// ---------------------------------------------------------------------------
// Check Usage Limit
// ---------------------------------------------------------------------------

export interface LimitCheckResponse {
  /** Resultado da verificação */
  result: LimitCheckResult;
  /** Tipo do evento verificado */
  eventType: UsageEventType;
  /** Uso atual */
  currentUsage: number;
  /** Limite do plano */
  limit: number;
  /** Restante */
  remaining: number;
  /** Percentual usado */
  usedPercent: number;
  /** Mensagem legível */
  message: string;
  /** Sugestão de ação (se bloqueado) */
  upgradeHint?: string;
}

/**
 * Verifica se o tenant pode executar uma operação baseado nos limites do plano.
 *
 * Ordem de verificação:
 *   1. Feature flag habilitada?
 *   2. Limite de uso atingido?
 *   3. Retorna ALLOWED, WARNING ou BLOCKED
 */
export async function checkUsageLimit(
  tenantContext: TenantContext,
  eventType: UsageEventType,
  supabase: SupabaseClient | null,
  quantityToAdd: number = 1,
): Promise<LimitCheckResponse> {
  // Admin bypass — DB8 team / founder can test without hitting limits
  if (isAdminUserId(tenantContext.userId)) {
    return {
      result: LimitCheckResult.ALLOWED,
      eventType,
      currentUsage: 0,
      limit: -1, // -1 = unlimited (admin)
      remaining: -1,
      usedPercent: 0,
      message: `Admin bypass (${EVENT_LABELS[eventType]}).`,
    };
  }

  // 1. Check feature flag
  const requiredFeature = EVENT_REQUIRES_FEATURE[eventType];
  if (requiredFeature && !tenantContext.features[requiredFeature]) {
    return {
      result: LimitCheckResult.FEATURE_DISABLED,
      eventType,
      currentUsage: 0,
      limit: 0,
      remaining: 0,
      usedPercent: 0,
      message: `Feature "${requiredFeature}" não habilitada no plano ${tenantContext.planTier}.`,
      upgradeHint: `Faça upgrade para o plano Pro ou Business para acessar esta funcionalidade.`,
    };
  }

  // 2. Get plan limits
  const planLimits = BILLING_PLAN_LIMITS[tenantContext.planTier]
    ?? BILLING_PLAN_LIMITS['starter'];
  const limitField = EVENT_TO_LIMIT_FIELD[eventType];

  if (!limitField) {
    // No limit defined for this event type
    return {
      result: LimitCheckResult.ALLOWED,
      eventType,
      currentUsage: 0,
      limit: 0,
      remaining: 0,
      usedPercent: 0,
      message: 'Operação permitida (sem limite definido).',
    };
  }

  const limit = planLimits[limitField];
  if (limit === 0 && requiredFeature) {
    // Limit is 0 and requires feature = not available
    return {
      result: LimitCheckResult.FEATURE_DISABLED,
      eventType,
      currentUsage: 0,
      limit: 0,
      remaining: 0,
      usedPercent: 0,
      message: `${EVENT_LABELS[eventType]} não disponível no plano ${tenantContext.planTier}.`,
      upgradeHint: 'Faça upgrade para acessar.',
    };
  }

  // 3. Get current usage
  const currentUsage = await getUsageCount(
    tenantContext.tenantId,
    eventType,
    supabase,
  );

  const afterUsage = currentUsage + quantityToAdd;
  const remaining = Math.max(0, limit - currentUsage);
  const usedPercent = limit > 0 ? Math.round((currentUsage / limit) * 100) : 0;

  // 4. Evaluate
  if (afterUsage > limit && limit > 0) {
    logger.warn(
      `[LimitChecker] BLOCKED: tenant=${tenantContext.tenantId} ` +
      `${eventType} ${currentUsage}/${limit}`,
    );

    return {
      result: LimitCheckResult.BLOCKED,
      eventType,
      currentUsage,
      limit,
      remaining: 0,
      usedPercent: Math.min(100, usedPercent),
      message: `Limite de ${EVENT_LABELS[eventType]} atingido: ${currentUsage}/${limit} no plano ${tenantContext.planTier}.`,
      upgradeHint: buildUpgradeHint(tenantContext.planTier, eventType, limit),
    };
  }

  if (usedPercent >= 80) {
    return {
      result: LimitCheckResult.WARNING,
      eventType,
      currentUsage,
      limit,
      remaining,
      usedPercent,
      message: `${EVENT_LABELS[eventType]}: ${currentUsage}/${limit} (${usedPercent}%). Próximo do limite.`,
    };
  }

  return {
    result: LimitCheckResult.ALLOWED,
    eventType,
    currentUsage,
    limit,
    remaining,
    usedPercent,
    message: `${EVENT_LABELS[eventType]}: ${currentUsage}/${limit}.`,
  };
}

// ---------------------------------------------------------------------------
// Increment + Check (atomic-like)
// ---------------------------------------------------------------------------

/**
 * Verifica limite e, se permitido, registra o uso.
 * Retorna o resultado da verificação.
 */
export async function checkAndRecordUsage(
  tenantContext: TenantContext,
  eventType: UsageEventType,
  supabase: SupabaseClient | null,
  options?: {
    jobId?: string;
    artifactId?: string;
    quantity?: number;
    estimatedCostUsd?: number;
    metadata?: Record<string, unknown>;
  },
): Promise<LimitCheckResponse> {
  const { recordUsage } = await import('./usage-meter.js');
  const quantity = options?.quantity ?? 1;

  const check = await checkUsageLimit(tenantContext, eventType, supabase, quantity);

  if (check.result === LimitCheckResult.BLOCKED || check.result === LimitCheckResult.FEATURE_DISABLED) {
    return check;
  }

  // Record usage
  await recordUsage({
    tenantId: tenantContext.tenantId,
    userId: tenantContext.userId,
    eventType,
    quantity,
    jobId: options?.jobId,
    artifactId: options?.artifactId,
    estimatedCostUsd: options?.estimatedCostUsd,
    metadata: options?.metadata,
  }, supabase);

  return check;
}

// ---------------------------------------------------------------------------
// Get Remaining Quota
// ---------------------------------------------------------------------------

/**
 * Retorna a quota restante para um evento específico.
 */
export async function getRemainingQuota(
  tenantContext: TenantContext,
  eventType: UsageEventType,
  supabase: SupabaseClient | null,
): Promise<{ remaining: number; limit: number; used: number }> {
  const planLimits = BILLING_PLAN_LIMITS[tenantContext.planTier]
    ?? BILLING_PLAN_LIMITS['starter'];
  const limitField = EVENT_TO_LIMIT_FIELD[eventType];
  const limit = limitField ? planLimits[limitField] : 0;

  const used = await getUsageCount(tenantContext.tenantId, eventType, supabase);

  return {
    remaining: Math.max(0, limit - used),
    limit,
    used,
  };
}

// ---------------------------------------------------------------------------
// Usage Summary
// ---------------------------------------------------------------------------

/**
 * Gera um resumo completo de uso do tenant para o período atual.
 */
export async function getUsageSummary(
  tenantContext: TenantContext,
  supabase: SupabaseClient | null,
): Promise<UsageSummary> {
  const planLimits = BILLING_PLAN_LIMITS[tenantContext.planTier]
    ?? BILLING_PLAN_LIMITS['starter'];

  const counters = await getAllUsageCounts(tenantContext.tenantId, supabase);
  const features: FeatureUsage[] = [];
  const alerts: string[] = [];
  let totalEstimatedCost = 0;
  const adminBypass = isAdminUserId(tenantContext.userId);

  // Build feature usage for each tracked event
  const trackedEvents: UsageEventType[] = [
    UsageEventType.JOB_CREATED,
    UsageEventType.VIDEO_RENDER_REQUESTED,
    UsageEventType.VARIANT_GENERATED,
    UsageEventType.THUMBNAIL_GENERATED,
    UsageEventType.AUTO_PUBLISH_USED,
    UsageEventType.EXPERIMENT_CREATED,
    UsageEventType.BLOG_GENERATED,
    UsageEventType.LANDING_PAGE_GENERATED,
    UsageEventType.REVISION_REQUESTED,
    UsageEventType.TTS_CALL,
    UsageEventType.AI_CALL,
  ];

  for (const eventType of trackedEvents) {
    const limitField = EVENT_TO_LIMIT_FIELD[eventType];
    const limit = limitField ? planLimits[limitField] : 0;
    const used = counters.get(eventType) ?? 0;
    const remaining = adminBypass ? -1 : Math.max(0, limit - used);
    const usedPercent = adminBypass ? 0 : (limit > 0 ? Math.round((used / limit) * 100) : 0);

    let status: LimitCheckResult;
    if (adminBypass) {
      status = LimitCheckResult.ALLOWED; // admin always allowed
    } else if (limit === 0 && EVENT_REQUIRES_FEATURE[eventType]) {
      status = LimitCheckResult.FEATURE_DISABLED;
    } else if (used >= limit && limit > 0) {
      status = LimitCheckResult.BLOCKED;
      alerts.push(`${EVENT_LABELS[eventType]}: limite atingido (${used}/${limit})`);
    } else if (usedPercent >= 80) {
      status = LimitCheckResult.WARNING;
      alerts.push(`${EVENT_LABELS[eventType]}: ${usedPercent}% do limite`);
    } else {
      status = LimitCheckResult.ALLOWED;
    }

    features.push({
      eventType,
      label: EVENT_LABELS[eventType],
      used,
      limit,
      remaining,
      usedPercent,
      status,
    });
  }

  return {
    tenantId: tenantContext.tenantId,
    planTier: tenantContext.planTier,
    periodKey: currentMonthKey(),
    features,
    estimatedCostUsd: totalEstimatedCost,
    costLimitUsd: planLimits.maxMonthlyCostUsd,
    alerts,
    generatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildUpgradeHint(
  currentTier: string,
  eventType: UsageEventType,
  currentLimit: number,
): string {
  if (currentTier === 'starter') {
    const proLimit = BILLING_PLAN_LIMITS['pro'][EVENT_TO_LIMIT_FIELD[eventType] ?? 'jobsPerMonth'];
    return `Upgrade para Pro: limite de ${proLimit} ${EVENT_LABELS[eventType]}/mês.`;
  }
  if (currentTier === 'pro') {
    const bizLimit = BILLING_PLAN_LIMITS['agency'][EVENT_TO_LIMIT_FIELD[eventType] ?? 'jobsPerMonth'];
    return `Upgrade para Business: limite de ${bizLimit} ${EVENT_LABELS[eventType]}/mês.`;
  }
  return 'Entre em contato para limites customizados.';
}
