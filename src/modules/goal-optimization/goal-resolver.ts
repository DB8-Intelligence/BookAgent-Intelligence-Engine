/**
 * Goal Resolver — Goal-Driven Optimization
 *
 * Resolve o OptimizationProfile ativo para um tenant e transforma
 * em GoalDerivedParams concretos que o resto do sistema consome.
 *
 * Fluxo:
 *   TenantContext → resolve profile → apply trade-offs → derive params
 *
 * Parte 89: Goal-Driven Optimization
 */

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  OptimizationProfile,
  TenantGoalPreference,
  GoalDerivedParams,
  OptimizationConstraint,
  OptimizationTradeOff,
} from '../../domain/entities/goal-optimization.js';
import {
  OptimizationObjective,
  OptimizationAggressiveness,
  TradeOffDimension,
  PRESET_PROFILES,
  DEFAULT_OBJECTIVE_BY_PLAN,
} from '../../domain/entities/goal-optimization.js';
import type { TenantContext } from '../../domain/entities/tenant.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const PREFS_TABLE = 'bookagent_goal_preferences';

export async function saveTenantPreference(
  pref: TenantGoalPreference,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  await supabase.upsert(PREFS_TABLE, {
    tenant_id: pref.tenantId,
    active_profile_id: pref.activeProfileId,
    primary_objective: pref.primaryObjective,
    custom_constraints: pref.customConstraints,
    trade_off_overrides: pref.tradeOffOverrides,
    aggressiveness: pref.aggressiveness,
    updated_at: pref.updatedAt,
  }, 'tenant_id');
}

export async function getTenantPreference(
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<TenantGoalPreference | null> {
  if (!supabase) return null;

  const rows = await supabase.select<Record<string, unknown>>(PREFS_TABLE, {
    filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
    limit: 1,
  });

  if (rows.length === 0) return null;
  const row = rows[0]!;
  return {
    tenantId: row['tenant_id'] as string,
    activeProfileId: row['active_profile_id'] as string,
    primaryObjective: row['primary_objective'] as OptimizationObjective,
    customConstraints: (row['custom_constraints'] ?? []) as OptimizationConstraint[],
    tradeOffOverrides: (row['trade_off_overrides'] ?? []) as OptimizationTradeOff[],
    aggressiveness: row['aggressiveness'] as OptimizationAggressiveness,
    updatedAt: row['updated_at'] as string,
  };
}

// ---------------------------------------------------------------------------
// Profile Resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the active OptimizationProfile for a tenant.
 * Priority: tenant preference → plan default → balanced.
 */
export async function resolveProfile(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<OptimizationProfile> {
  // 1. Check tenant preference
  const pref = await getTenantPreference(tenantCtx.tenantId, supabase);

  if (pref) {
    const base = PRESET_PROFILES[pref.primaryObjective] ?? PRESET_PROFILES[OptimizationObjective.BALANCED];
    // Apply overrides
    const profile: OptimizationProfile = {
      ...base,
      id: pref.activeProfileId,
      aggressiveness: pref.aggressiveness,
      constraints: mergeConstraints(base.constraints, pref.customConstraints),
      tradeOffs: mergeTradeOffs(base.tradeOffs, pref.tradeOffOverrides),
    };

    logger.debug(`[GoalResolver] Resolved profile for tenant=${tenantCtx.tenantId}: ${profile.name} (from preference)`);
    return profile;
  }

  // 2. Plan default
  const objective = DEFAULT_OBJECTIVE_BY_PLAN[tenantCtx.planTier] ?? OptimizationObjective.BALANCED;
  const profile = PRESET_PROFILES[objective];

  logger.debug(`[GoalResolver] Resolved profile for tenant=${tenantCtx.tenantId}: ${profile.name} (plan default)`);
  return profile;
}

// ---------------------------------------------------------------------------
// Parameter Derivation
// ---------------------------------------------------------------------------

/**
 * Derives concrete system parameters from an OptimizationProfile.
 * These params are consumed by strategy, campaign, scheduling, etc.
 */
export function deriveParams(
  profile: OptimizationProfile,
  tenantCtx: TenantContext,
): GoalDerivedParams {
  const p = profile.priorities;
  const objective = profile.primaryObjective;

  // Format selection based on objective
  const preferredFormat = resolvePreferredFormat(objective, p);

  // Channel selection
  const preferredChannel = 'instagram'; // default for real estate

  // Preset
  const recommendedPreset = resolvePreset(objective);

  // Intensity based on awareness + speed priorities
  const intensityScore = (p.awareness + p.speed) / 2;
  const suggestedIntensity: GoalDerivedParams['suggestedIntensity'] =
    intensityScore >= 70 ? 'high' :
    intensityScore >= 45 ? 'medium' : 'low';

  // Quality threshold from priorities + constraints
  const qualityConstraint = profile.constraints.find((c) => c.type === 'min_quality_score' && c.enabled);
  const minQualityScore = qualityConstraint?.value ?? (p.quality >= 70 ? 70 : p.quality >= 50 ? 50 : 40);

  // Auto publish: enabled if speed/automation is high and quality is not the primary concern
  const autoPublishEnabled = tenantCtx.features.autoPublish && p.speed >= 50;

  // Campaign size from constraints
  const itemConstraint = profile.constraints.find((c) => c.type === 'max_items_per_campaign' && c.enabled);
  const maxCampaignItems = itemConstraint?.value ?? (profile.aggressiveness === OptimizationAggressiveness.AGGRESSIVE ? 10 : 7);

  // Cadence from constraints + priorities
  const pubConstraint = profile.constraints.find((c) => c.type === 'max_publications_per_day' && c.enabled);
  const maxPublicationsPerDay = pubConstraint?.value ?? (suggestedIntensity === 'high' ? 3 : 2);
  const minIntervalHours = suggestedIntensity === 'high' ? 3 : suggestedIntensity === 'medium' ? 4 : 6;

  // Premium templates and variants
  const usePremiumTemplates = p.quality >= 70 && tenantCtx.planTier !== 'starter';
  const prioritizeVariants = p.awareness >= 60 && tenantCtx.features.autoVariants;

  return {
    preferredFormat,
    preferredChannel,
    recommendedPreset,
    suggestedIntensity,
    minQualityScore,
    autoPublishEnabled,
    maxCampaignItems,
    maxPublicationsPerDay,
    minIntervalHours,
    usePremiumTemplates,
    prioritizeVariants,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvePreferredFormat(objective: OptimizationObjective, p: { awareness: number; engagement: number; conversion: number }): string {
  switch (objective) {
    case OptimizationObjective.AWARENESS:
    case OptimizationObjective.FAST_TURNAROUND:
      return 'reel';
    case OptimizationObjective.ENGAGEMENT:
      return p.engagement > 80 ? 'carousel' : 'reel';
    case OptimizationObjective.CONVERSION:
      return 'reel';
    case OptimizationObjective.HIGH_QUALITY:
      return 'video_long';
    case OptimizationObjective.LOW_COST:
      return 'post';
    default:
      return 'reel';
  }
}

function resolvePreset(objective: OptimizationObjective): string {
  const presetMap: Record<OptimizationObjective, string> = {
    [OptimizationObjective.AWARENESS]: 'fast-sales',
    [OptimizationObjective.ENGAGEMENT]: 'corporate',
    [OptimizationObjective.CONVERSION]: 'fast-sales',
    [OptimizationObjective.LOW_COST]: 'corporate',
    [OptimizationObjective.HIGH_QUALITY]: 'luxury',
    [OptimizationObjective.FAST_TURNAROUND]: 'fast-sales',
    [OptimizationObjective.BALANCED]: 'corporate',
  };
  return presetMap[objective];
}

function mergeConstraints(base: OptimizationConstraint[], overrides: OptimizationConstraint[]): OptimizationConstraint[] {
  const result = [...base];
  for (const override of overrides) {
    const idx = result.findIndex((c) => c.type === override.type);
    if (idx >= 0) {
      result[idx] = override;
    } else {
      result.push(override);
    }
  }
  return result;
}

function mergeTradeOffs(base: OptimizationTradeOff[], overrides: OptimizationTradeOff[]): OptimizationTradeOff[] {
  const result = [...base];
  for (const override of overrides) {
    const idx = result.findIndex(
      (t) => t.dimensionA === override.dimensionA && t.dimensionB === override.dimensionB,
    );
    if (idx >= 0) {
      result[idx] = override;
    } else {
      result.push(override);
    }
  }
  return result;
}
