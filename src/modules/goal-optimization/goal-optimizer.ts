/**
 * Goal Optimizer — Goal-Driven Optimization
 *
 * Produz GoalEvaluationResult com recomendações goal-driven e
 * parâmetros derivados que influenciam strategy/campaign/scheduling.
 *
 * Cada recomendação é explicável: área, decisão, rationale e trade-off.
 *
 * Parte 89: Goal-Driven Optimization
 */

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  OptimizationProfile,
  GoalEvaluationResult,
  GoalDrivenRecommendation,
  GoalDerivedParams,
} from '../../domain/entities/goal-optimization.js';
import {
  OptimizationObjective,
  OptimizationAggressiveness,
  TradeOffDimension,
  OBJECTIVE_OPT_LABELS,
} from '../../domain/entities/goal-optimization.js';
import type { TenantContext } from '../../domain/entities/tenant.js';
import { resolveProfile, deriveParams } from './goal-resolver.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Evaluate Goals
// ---------------------------------------------------------------------------

/**
 * Runs a full goal evaluation: resolves profile, derives params,
 * generates recommendations, resolves trade-offs.
 */
export async function evaluateGoals(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<GoalEvaluationResult> {
  // 1. Resolve profile
  const profile = await resolveProfile(tenantCtx, supabase);

  // 2. Derive concrete params
  const params = deriveParams(profile, tenantCtx);

  // 3. Generate recommendations
  const recommendations = generateRecommendations(profile, params, tenantCtx);

  // 4. Resolve trade-offs
  const resolvedTradeOffs = profile.tradeOffs.map((t) => ({
    tradeOff: t,
    resolution: resolveTradeOff(t, profile.primaryObjective),
  }));

  // 5. Build summary
  const summary = buildSummary(profile, params, recommendations);

  logger.info(
    `[GoalOptimizer] Evaluated goals for tenant=${tenantCtx.tenantId}: ` +
    `profile=${profile.name} objective=${profile.primaryObjective} ` +
    `recs=${recommendations.length}`,
  );

  return {
    profileId: profile.id,
    profileName: profile.name,
    primaryObjective: profile.primaryObjective,
    recommendations,
    resolvedTradeOffs,
    activeConstraints: profile.constraints.filter((c) => c.enabled),
    derivedParams: params,
    summary,
    evaluatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Recommendation Generation
// ---------------------------------------------------------------------------

function generateRecommendations(
  profile: OptimizationProfile,
  params: GoalDerivedParams,
  tenantCtx: TenantContext,
): GoalDrivenRecommendation[] {
  const recs: GoalDrivenRecommendation[] = [];
  const obj = profile.primaryObjective;
  const label = OBJECTIVE_OPT_LABELS[obj];

  // Strategy recommendation
  recs.push({
    area: 'strategy',
    recommendation: `Estratégia orientada para ${label.toLowerCase()}`,
    rationale: `O objetivo primário ${label} define foco em ${getStrategyFocus(obj)}. ` +
      `Intensidade ${params.suggestedIntensity} derivada dos pesos de awareness (${profile.priorities.awareness}) e speed (${profile.priorities.speed}).`,
    drivenBy: obj,
    tradeOffApplied: null,
    impact: 'high',
  });

  // Template/preset recommendation
  recs.push({
    area: 'template',
    recommendation: `Formato preferido: ${params.preferredFormat}, preset: ${params.recommendedPreset}`,
    rationale: `${label} favorece ${params.preferredFormat} por ${getFormatRationale(obj)}. ` +
      `${params.usePremiumTemplates ? 'Templates premium habilitados.' : 'Templates standard para controle de custo.'}`,
    drivenBy: obj,
    tradeOffApplied: null,
    impact: 'medium',
  });

  // Cadence recommendation
  recs.push({
    area: 'cadence',
    recommendation: `Max ${params.maxPublicationsPerDay}/dia, intervalo mínimo ${params.minIntervalHours}h`,
    rationale: `Cadência ${params.suggestedIntensity} alinhada com objetivo ${label}. ` +
      `Max ${params.maxCampaignItems} itens por campanha.`,
    drivenBy: obj,
    tradeOffApplied: null,
    impact: 'medium',
  });

  // Auto publish recommendation
  if (tenantCtx.features.autoPublish) {
    recs.push({
      area: 'auto_publish',
      recommendation: params.autoPublishEnabled
        ? 'Auto publish ativado — publicação automática após aprovação'
        : 'Auto publish conservador — publicação manual recomendada',
      rationale: params.autoPublishEnabled
        ? `Velocidade (${profile.priorities.speed}) justifica publicação automática para ${label}.`
        : `Qualidade (${profile.priorities.quality}) e controle prevalecem sobre velocidade.`,
      drivenBy: obj,
      tradeOffApplied: params.autoPublishEnabled ? null : 'quality > speed',
      impact: 'medium',
    });
  }

  // Variant recommendation
  if (tenantCtx.features.autoVariants) {
    recs.push({
      area: 'variant',
      recommendation: params.prioritizeVariants
        ? 'Variantes automáticas ativadas para ampliar alcance'
        : 'Variantes reduzidas para controle de custo/complexidade',
      rationale: params.prioritizeVariants
        ? `Awareness (${profile.priorities.awareness}) alta justifica mais variantes.`
        : `Custo (${profile.priorities.cost}) ou simplicidade prevalecem.`,
      drivenBy: obj,
      tradeOffApplied: params.prioritizeVariants ? null : 'cost > variety',
      impact: 'low',
    });
  }

  // Quality threshold recommendation
  recs.push({
    area: 'campaign',
    recommendation: `Quality score mínimo: ${params.minQualityScore}`,
    rationale: `Threshold de ${params.minQualityScore} derivado do peso quality (${profile.priorities.quality}) ` +
      `${profile.constraints.some((c) => c.type === 'min_quality_score') ? 'e constraint explícito' : 'sem constraint adicional'}.`,
    drivenBy: obj,
    tradeOffApplied: null,
    impact: profile.priorities.quality >= 70 ? 'high' : 'low',
  });

  // Trade-off specific recommendations
  for (const t of profile.tradeOffs) {
    if (Math.abs(t.bias) >= 50) {
      const favored = t.bias > 0 ? t.dimensionB : t.dimensionA;
      const sacrificed = t.bias > 0 ? t.dimensionA : t.dimensionB;
      recs.push({
        area: 'strategy',
        recommendation: `Trade-off: ${favored} priorizado sobre ${sacrificed}`,
        rationale: t.description,
        drivenBy: obj,
        tradeOffApplied: `${sacrificed} → ${favored} (bias: ${t.bias})`,
        impact: 'medium',
      });
    }
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Trade-Off Resolution
// ---------------------------------------------------------------------------

function resolveTradeOff(
  tradeOff: { dimensionA: TradeOffDimension; dimensionB: TradeOffDimension; bias: number; description: string },
  objective: OptimizationObjective,
): string {
  const favored = tradeOff.bias > 0 ? tradeOff.dimensionB : tradeOff.dimensionA;
  const strength = Math.abs(tradeOff.bias);

  if (strength >= 70) return `Forte preferência por ${favored} no perfil ${OBJECTIVE_OPT_LABELS[objective]}`;
  if (strength >= 40) return `Preferência moderada por ${favored}`;
  return `Leve inclinação para ${favored}, mas flexível`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStrategyFocus(obj: OptimizationObjective): string {
  const focusMap: Record<OptimizationObjective, string> = {
    [OptimizationObjective.AWARENESS]: 'alcance máximo com reels e stories de alta frequência',
    [OptimizationObjective.ENGAGEMENT]: 'interação via carrosséis, enquetes e CTAs interativos',
    [OptimizationObjective.CONVERSION]: 'leads diretos com reels de CTA e landing pages',
    [OptimizationObjective.LOW_COST]: 'formatos simples e alta eficiência operacional',
    [OptimizationObjective.HIGH_QUALITY]: 'outputs premium com revisão e scoring alto',
    [OptimizationObjective.FAST_TURNAROUND]: 'produção rápida com máxima automação',
    [OptimizationObjective.BALANCED]: 'equilíbrio entre qualidade, custo e velocidade',
  };
  return focusMap[obj];
}

function getFormatRationale(obj: OptimizationObjective): string {
  const rationaleMap: Record<OptimizationObjective, string> = {
    [OptimizationObjective.AWARENESS]: 'maior alcance orgânico no Instagram',
    [OptimizationObjective.ENGAGEMENT]: 'maior taxa de interação e salvamentos',
    [OptimizationObjective.CONVERSION]: 'CTA direto e alta taxa de clique',
    [OptimizationObjective.LOW_COST]: 'menor custo de produção e render',
    [OptimizationObjective.HIGH_QUALITY]: 'maior profundidade e impacto visual',
    [OptimizationObjective.FAST_TURNAROUND]: 'produção rápida e publicação imediata',
    [OptimizationObjective.BALANCED]: 'versatilidade e bom custo-benefício',
  };
  return rationaleMap[obj];
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function buildSummary(
  profile: OptimizationProfile,
  params: GoalDerivedParams,
  recs: GoalDrivenRecommendation[],
): string {
  const label = OBJECTIVE_OPT_LABELS[profile.primaryObjective];
  const secondary = profile.secondaryObjective
    ? `, complementado por ${OBJECTIVE_OPT_LABELS[profile.secondaryObjective].toLowerCase()}`
    : '';

  let summary = `Otimização orientada para ${label.toLowerCase()}${secondary}. ` +
    `Formato: ${params.preferredFormat}, preset: ${params.recommendedPreset}, ` +
    `intensidade: ${params.suggestedIntensity}.`;

  const activeConstraints = profile.constraints.filter((c) => c.enabled);
  if (activeConstraints.length > 0) {
    summary += ` ${activeConstraints.length} constraint(s) ativo(s).`;
  }

  if (profile.tradeOffs.length > 0) {
    summary += ` ${profile.tradeOffs.length} trade-off(s) configurado(s).`;
  }

  return summary;
}
