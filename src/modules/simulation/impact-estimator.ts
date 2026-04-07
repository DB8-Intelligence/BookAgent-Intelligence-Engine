/**
 * Impact Estimator — Simulation & What-If Engine
 *
 * Estima impactos de cenários alternativos comparados ao baseline.
 * Usa dados de analytics, learning, memory e knowledge graph para
 * inferir consequências esperadas de cada mudança proposta.
 *
 * Modelo de estimativa V1:
 *   - Heurísticas baseadas em eixos de variação
 *   - Dados históricos do tenant (se disponíveis)
 *   - Knowledge graph (relações e pesos)
 *   - Confidence level baseado em volume de dados
 *
 * Parte 93: Simulation & What-If Engine
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  SimulationScenario,
  SimulationResult,
  ScenarioComparison,
  ImpactEstimate,
  WhatIfChange,
  WhatIfRecommendation,
} from '../../domain/entities/simulation.js';
import {
  SimulationStatus,
  SimulationAxis,
  ConfidenceLevel,
  ImpactDirection,
  ImpactDimension,
  RecommendationCategory,
  DEFAULT_CAVEATS,
  MIN_DATA_POINTS_HIGH_CONFIDENCE,
  MIN_DATA_POINTS_MEDIUM_CONFIDENCE,
} from '../../domain/entities/simulation.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const SIMULATIONS_TABLE = 'bookagent_simulations';

// ---------------------------------------------------------------------------
// Main Simulation Runner
// ---------------------------------------------------------------------------

/**
 * Runs a full simulation: estimates impacts for each alternative,
 * compares them to the baseline, and generates recommendations.
 */
export async function runSimulation(
  tenantId: string | null,
  baseline: SimulationScenario,
  alternatives: SimulationScenario[],
  supabase: SupabaseClient | null,
): Promise<SimulationResult> {
  const startMs = Date.now();

  // Gather tenant data for estimation
  const tenantData = await gatherTenantData(tenantId, supabase);

  // Score baseline
  baseline.overallScore = scoreScenario(baseline, tenantData);

  // Estimate impacts for each alternative
  for (const alt of alternatives) {
    alt.impacts = estimateImpacts(alt.changes, tenantData);
    alt.tradeoffs = identifyTradeoffs(alt.impacts);
    alt.overallScore = scoreScenario(alt, tenantData) + computeImpactDelta(alt.impacts);
    // Clamp score
    alt.overallScore = Math.max(0, Math.min(100, alt.overallScore));
  }

  // Compare each alternative to baseline
  const comparisons: ScenarioComparison[] = alternatives.map((alt) =>
    compareScenarios(baseline, alt),
  );

  // Generate recommendations
  const recommendations = generateRecommendations(comparisons, alternatives);

  // Build summary
  const summary = buildSimulationSummary(baseline, alternatives, comparisons);

  const durationMs = Date.now() - startMs;

  const result: SimulationResult = {
    id: uuid(),
    tenantId,
    status: SimulationStatus.COMPLETED,
    baseline,
    alternatives,
    comparisons,
    recommendations,
    summary,
    caveats: [...DEFAULT_CAVEATS],
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs,
  };

  // Persist
  await saveSimulation(result, supabase);

  logger.info(
    `[ImpactEstimator] Simulation ${result.id} completed: ` +
    `${alternatives.length} alt(s), ${recommendations.length} rec(s), ${durationMs}ms`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Tenant Data Gathering
// ---------------------------------------------------------------------------

interface TenantData {
  publicationCount: number;
  campaignCount: number;
  jobCount: number;
  avgEdgeWeight: number;
  goalObjective: string | null;
  memoryPatternCount: number;
}

async function gatherTenantData(
  tenantId: string | null,
  supabase: SupabaseClient | null,
): Promise<TenantData> {
  const data: TenantData = {
    publicationCount: 0,
    campaignCount: 0,
    jobCount: 0,
    avgEdgeWeight: 0,
    goalObjective: null,
    memoryPatternCount: 0,
  };

  if (!supabase || !tenantId) return data;

  const filter = [{ column: 'tenant_id', operator: 'eq' as const, value: tenantId }];

  try {
    const pubs = await supabase.select<Record<string, unknown>>('bookagent_publications', {
      filters: filter,
      select: 'id',
      limit: 500,
    });
    data.publicationCount = pubs.length;
  } catch { /* graceful */ }

  try {
    const camps = await supabase.select<Record<string, unknown>>('bookagent_campaigns', {
      filters: filter,
      select: 'id',
      limit: 500,
    });
    data.campaignCount = camps.length;
  } catch { /* graceful */ }

  try {
    const jobs = await supabase.select<Record<string, unknown>>('bookagent_job_meta', {
      filters: filter,
      select: 'job_id',
      limit: 500,
    });
    data.jobCount = jobs.length;
  } catch { /* graceful */ }

  try {
    const edges = await supabase.select<Record<string, unknown>>('bookagent_knowledge_edges', {
      filters: filter,
      select: 'weight',
      limit: 200,
    });
    if (edges.length > 0) {
      const totalW = edges.reduce((s, e) => s + ((e['weight'] as number) ?? 0), 0);
      data.avgEdgeWeight = Math.round(totalW / edges.length);
    }
  } catch { /* graceful */ }

  try {
    const goals = await supabase.select<Record<string, unknown>>('bookagent_goal_preferences', {
      filters: filter,
      select: 'objective',
      limit: 1,
      orderBy: 'created_at',
      orderDesc: true,
    });
    if (goals.length > 0) {
      data.goalObjective = (goals[0]['objective'] as string) ?? null;
    }
  } catch { /* graceful */ }

  try {
    const mem = await supabase.select<Record<string, unknown>>('bookagent_tenant_memory', {
      filters: filter,
      select: 'id',
      limit: 50,
    });
    data.memoryPatternCount = mem.length;
  } catch { /* graceful */ }

  return data;
}

// ---------------------------------------------------------------------------
// Impact Estimation per Change
// ---------------------------------------------------------------------------

function estimateImpacts(
  changes: WhatIfChange[],
  data: TenantData,
): ImpactEstimate[] {
  const impacts: ImpactEstimate[] = [];

  for (const change of changes) {
    impacts.push(...estimateChangeImpact(change, data));
  }

  return impacts;
}

function estimateChangeImpact(
  change: WhatIfChange,
  data: TenantData,
): ImpactEstimate[] {
  const confidence = determineConfidence(data);

  switch (change.axis) {
    case SimulationAxis.CHANNEL:
      return estimateChannelChange(change, confidence);
    case SimulationAxis.CADENCE:
      return estimateCadenceChange(change, confidence);
    case SimulationAxis.GOAL_PRIORITY:
      return estimateGoalChange(change, data, confidence);
    case SimulationAxis.AUTO_PUBLISH:
      return estimateAutoPublishChange(change, confidence);
    case SimulationAxis.AUTONOMY_LEVEL:
      return estimateAutonomyChange(change, confidence);
    case SimulationAxis.VARIANT_COUNT:
      return estimateVariantCountChange(change, confidence);
    case SimulationAxis.CAMPAIGN_DURATION:
      return estimateDurationChange(change, confidence);
    case SimulationAxis.OUTPUT_MIX:
      return estimateOutputMixChange(change, confidence);
    case SimulationAxis.PRESET_TEMPLATE:
      return estimatePresetChange(change, confidence);
    default:
      return [];
  }
}

function determineConfidence(data: TenantData): ConfidenceLevel {
  const total = data.publicationCount + data.campaignCount + data.jobCount;
  if (total >= MIN_DATA_POINTS_HIGH_CONFIDENCE) return ConfidenceLevel.HIGH;
  if (total >= MIN_DATA_POINTS_MEDIUM_CONFIDENCE) return ConfidenceLevel.MEDIUM;
  if (total > 0) return ConfidenceLevel.LOW;
  return ConfidenceLevel.UNKNOWN;
}

// ---------------------------------------------------------------------------
// Per-Axis Estimators
// ---------------------------------------------------------------------------

function estimateChannelChange(change: WhatIfChange, confidence: ConfidenceLevel): ImpactEstimate[] {
  return [
    {
      dimension: ImpactDimension.REACH,
      direction: ImpactDirection.POSITIVE,
      magnitudePercent: 15,
      confidence,
      evidence: [`Adding/changing channel from "${change.fromValue}" to "${change.toValue}"`],
      rationale: 'A new channel typically increases reach by exposing content to a different audience segment.',
    },
    {
      dimension: ImpactDimension.COST,
      direction: ImpactDirection.NEGATIVE,
      magnitudePercent: -10,
      confidence,
      evidence: ['Additional channel requires adaptation effort'],
      rationale: 'Multi-channel distribution increases operational cost due to format adaptation.',
    },
  ];
}

function estimateCadenceChange(change: WhatIfChange, confidence: ConfidenceLevel): ImpactEstimate[] {
  const from = Number(change.fromValue) || 1;
  const to = Number(change.toValue) || 1;
  const increase = to > from;

  return [
    {
      dimension: ImpactDimension.REACH,
      direction: increase ? ImpactDirection.POSITIVE : ImpactDirection.NEGATIVE,
      magnitudePercent: increase ? Math.min(30, (to - from) * 10) : Math.max(-30, (to - from) * 10),
      confidence,
      evidence: [`Cadence change: ${from} → ${to} per day`],
      rationale: increase
        ? 'Higher cadence increases content visibility and audience touchpoints.'
        : 'Lower cadence reduces content volume, potentially lowering visibility.',
    },
    {
      dimension: ImpactDimension.QUALITY,
      direction: increase ? ImpactDirection.NEGATIVE : ImpactDirection.POSITIVE,
      magnitudePercent: increase ? -10 : 10,
      confidence,
      evidence: ['Quality vs quantity tradeoff'],
      rationale: increase
        ? 'Higher cadence may reduce time per piece, affecting quality.'
        : 'Lower cadence allows more time per piece, potentially improving quality.',
    },
    {
      dimension: ImpactDimension.COST,
      direction: increase ? ImpactDirection.NEGATIVE : ImpactDirection.POSITIVE,
      magnitudePercent: increase ? Math.max(-40, -(to - from) * 15) : Math.min(40, (from - to) * 15),
      confidence,
      evidence: [`${increase ? 'More' : 'Fewer'} outputs to generate`],
      rationale: `${increase ? 'Higher' : 'Lower'} cadence directly affects generation costs.`,
    },
  ];
}

function estimateGoalChange(
  change: WhatIfChange,
  data: TenantData,
  confidence: ConfidenceLevel,
): ImpactEstimate[] {
  const toGoal = String(change.toValue);
  const impacts: ImpactEstimate[] = [];

  if (toGoal === 'conversion' || toGoal === 'engagement') {
    impacts.push({
      dimension: toGoal === 'conversion' ? ImpactDimension.CONVERSION : ImpactDimension.ENGAGEMENT,
      direction: ImpactDirection.POSITIVE,
      magnitudePercent: 20,
      confidence,
      evidence: [`Shifting priority to ${toGoal}`],
      rationale: `Focusing optimization on ${toGoal} concentrates system decisions toward that metric.`,
    });
  }

  if (toGoal === 'low_cost') {
    impacts.push({
      dimension: ImpactDimension.COST,
      direction: ImpactDirection.POSITIVE,
      magnitudePercent: 25,
      confidence,
      evidence: ['Cost-optimized goal'],
      rationale: 'System will prefer cheaper providers, fewer variants, and simpler outputs.',
    });
    impacts.push({
      dimension: ImpactDimension.QUALITY,
      direction: ImpactDirection.NEGATIVE,
      magnitudePercent: -15,
      confidence,
      evidence: ['Cost-quality tradeoff'],
      rationale: 'Cost optimization may reduce output quality as cheaper options are preferred.',
    });
  }

  if (toGoal === 'high_quality') {
    impacts.push({
      dimension: ImpactDimension.QUALITY,
      direction: ImpactDirection.POSITIVE,
      magnitudePercent: 25,
      confidence,
      evidence: ['Quality-focused goal'],
      rationale: 'System will prefer higher-quality providers and more review cycles.',
    });
    impacts.push({
      dimension: ImpactDimension.COST,
      direction: ImpactDirection.NEGATIVE,
      magnitudePercent: -20,
      confidence,
      evidence: ['Quality-cost tradeoff'],
      rationale: 'Quality optimization typically increases generation and review costs.',
    });
  }

  if (impacts.length === 0) {
    impacts.push({
      dimension: ImpactDimension.CONSISTENCY,
      direction: ImpactDirection.POSITIVE,
      magnitudePercent: 10,
      confidence: ConfidenceLevel.LOW,
      evidence: [`Goal changed to ${toGoal}`],
      rationale: 'Any explicit goal alignment improves system decision consistency.',
    });
  }

  return impacts;
}

function estimateAutoPublishChange(change: WhatIfChange, confidence: ConfidenceLevel): ImpactEstimate[] {
  const enabling = change.toValue === true || change.toValue === 'true';

  return [
    {
      dimension: ImpactDimension.SPEED,
      direction: enabling ? ImpactDirection.POSITIVE : ImpactDirection.NEGATIVE,
      magnitudePercent: enabling ? 30 : -20,
      confidence,
      evidence: [`Auto-publish ${enabling ? 'enabled' : 'disabled'}`],
      rationale: enabling
        ? 'Auto-publish eliminates manual approval delay, speeding up content delivery.'
        : 'Manual approval adds latency to the publication pipeline.',
    },
    {
      dimension: ImpactDimension.RISK,
      direction: enabling ? ImpactDirection.NEGATIVE : ImpactDirection.POSITIVE,
      magnitudePercent: enabling ? -15 : 15,
      confidence,
      evidence: ['Human review tradeoff'],
      rationale: enabling
        ? 'Without human review, problematic content may be published automatically.'
        : 'Manual review catches issues before publication, reducing risk.',
    },
  ];
}

function estimateAutonomyChange(change: WhatIfChange, confidence: ConfidenceLevel): ImpactEstimate[] {
  const levels = ['manual', 'assisted', 'semi_autonomous', 'supervised_autonomous', 'autonomous'];
  const fromIdx = levels.indexOf(String(change.fromValue));
  const toIdx = levels.indexOf(String(change.toValue));
  const increasing = toIdx > fromIdx;

  return [
    {
      dimension: ImpactDimension.SPEED,
      direction: increasing ? ImpactDirection.POSITIVE : ImpactDirection.NEGATIVE,
      magnitudePercent: increasing ? 20 : -15,
      confidence,
      evidence: [`Autonomy: ${change.fromValue} → ${change.toValue}`],
      rationale: increasing
        ? 'Higher autonomy reduces human checkpoints, accelerating operations.'
        : 'Lower autonomy adds more governance gates, slowing operations.',
    },
    {
      dimension: ImpactDimension.RISK,
      direction: increasing ? ImpactDirection.NEGATIVE : ImpactDirection.POSITIVE,
      magnitudePercent: increasing ? -10 : 10,
      confidence,
      evidence: ['Autonomy-risk tradeoff'],
      rationale: increasing
        ? 'More autonomy means fewer human checks — errors may propagate further.'
        : 'More human oversight catches errors earlier.',
    },
  ];
}

function estimateVariantCountChange(change: WhatIfChange, confidence: ConfidenceLevel): ImpactEstimate[] {
  const from = Number(change.fromValue) || 1;
  const to = Number(change.toValue) || 1;
  const increasing = to > from;

  return [
    {
      dimension: ImpactDimension.ENGAGEMENT,
      direction: increasing ? ImpactDirection.POSITIVE : ImpactDirection.NEGATIVE,
      magnitudePercent: increasing ? 15 : -10,
      confidence,
      evidence: [`Variants: ${from} → ${to}`],
      rationale: increasing
        ? 'More variants allow A/B testing and audience-specific targeting.'
        : 'Fewer variants reduce experimentation opportunities.',
    },
    {
      dimension: ImpactDimension.COST,
      direction: increasing ? ImpactDirection.NEGATIVE : ImpactDirection.POSITIVE,
      magnitudePercent: increasing ? Math.max(-50, -(to - from) * 20) : Math.min(50, (from - to) * 20),
      confidence,
      evidence: ['Variant generation cost'],
      rationale: `Each additional variant adds generation cost (roughly linear).`,
    },
  ];
}

function estimateDurationChange(change: WhatIfChange, confidence: ConfidenceLevel): ImpactEstimate[] {
  const from = Number(change.fromValue) || 30;
  const to = Number(change.toValue) || 30;
  const longer = to > from;

  return [
    {
      dimension: ImpactDimension.REACH,
      direction: longer ? ImpactDirection.POSITIVE : ImpactDirection.NEGATIVE,
      magnitudePercent: longer ? 20 : -15,
      confidence,
      evidence: [`Duration: ${from}d → ${to}d`],
      rationale: longer
        ? 'Longer campaigns accumulate more audience touchpoints over time.'
        : 'Shorter campaigns have less time to build audience momentum.',
    },
  ];
}

function estimateOutputMixChange(change: WhatIfChange, confidence: ConfidenceLevel): ImpactEstimate[] {
  return [{
    dimension: ImpactDimension.ENGAGEMENT,
    direction: ImpactDirection.POSITIVE,
    magnitudePercent: 10,
    confidence: confidence === ConfidenceLevel.UNKNOWN ? ConfidenceLevel.LOW : confidence,
    evidence: [`Output mix: ${change.fromValue} → ${change.toValue}`],
    rationale: 'Diversifying output formats typically increases engagement across audience segments.',
  }];
}

function estimatePresetChange(change: WhatIfChange, confidence: ConfidenceLevel): ImpactEstimate[] {
  return [{
    dimension: ImpactDimension.QUALITY,
    direction: ImpactDirection.MIXED,
    magnitudePercent: 5,
    confidence: ConfidenceLevel.LOW,
    evidence: [`Preset: ${change.fromValue} → ${change.toValue}`],
    rationale: 'Preset/template changes affect visual quality but impact varies by audience and context.',
  }];
}

// ---------------------------------------------------------------------------
// Scenario Scoring & Comparison
// ---------------------------------------------------------------------------

function scoreScenario(scenario: SimulationScenario, data: TenantData): number {
  let score = 50; // Base score

  // Bonus for having data
  if (data.publicationCount > 10) score += 5;
  if (data.campaignCount > 3) score += 5;
  if (data.memoryPatternCount > 0) score += 5;
  if (data.goalObjective) score += 5;

  return Math.min(100, score);
}

function computeImpactDelta(impacts: ImpactEstimate[]): number {
  let delta = 0;
  for (const impact of impacts) {
    // Weight by confidence
    const confMultiplier = impact.confidence === ConfidenceLevel.HIGH ? 1.0
      : impact.confidence === ConfidenceLevel.MEDIUM ? 0.7
      : impact.confidence === ConfidenceLevel.LOW ? 0.4
      : 0.1;

    delta += (impact.magnitudePercent * confMultiplier) / 10;
  }
  return Math.round(delta);
}

function compareScenarios(
  baseline: SimulationScenario,
  alternative: SimulationScenario,
): ScenarioComparison {
  const gains = alternative.impacts.filter((i) => i.magnitudePercent > 0);
  const losses = alternative.impacts.filter((i) => i.magnitudePercent < 0);
  const scoreDelta = alternative.overallScore - baseline.overallScore;

  let verdict: ScenarioComparison['verdict'];
  if (scoreDelta > 5) verdict = 'recommended';
  else if (scoreDelta < -5) verdict = 'not_recommended';
  else verdict = 'neutral';

  const summary = buildComparisonSummary(baseline, alternative, gains, losses, scoreDelta, verdict);

  return {
    baselineId: baseline.id,
    alternativeId: alternative.id,
    gains,
    losses,
    scoreDelta,
    summary,
    verdict,
  };
}

function buildComparisonSummary(
  baseline: SimulationScenario,
  alt: SimulationScenario,
  gains: ImpactEstimate[],
  losses: ImpactEstimate[],
  delta: number,
  verdict: string,
): string {
  const parts: string[] = [];
  parts.push(`"${alt.name}" vs baseline: score delta ${delta >= 0 ? '+' : ''}${delta}.`);

  if (gains.length > 0) {
    const dims = gains.map((g) => g.dimension).join(', ');
    parts.push(`Expected gains in: ${dims}.`);
  }
  if (losses.length > 0) {
    const dims = losses.map((l) => l.dimension).join(', ');
    parts.push(`Expected losses in: ${dims}.`);
  }

  if (alt.tradeoffs.length > 0) {
    parts.push(`Trade-offs: ${alt.tradeoffs.join('; ')}.`);
  }

  parts.push(`Verdict: ${verdict}.`);
  return parts.join(' ');
}

function identifyTradeoffs(impacts: ImpactEstimate[]): string[] {
  const tradeoffs: string[] = [];

  const positive = impacts.filter((i) => i.magnitudePercent > 0);
  const negative = impacts.filter((i) => i.magnitudePercent < 0);

  for (const pos of positive) {
    for (const neg of negative) {
      tradeoffs.push(
        `Gain in ${pos.dimension} (+${pos.magnitudePercent}%) may come at cost of ${neg.dimension} (${neg.magnitudePercent}%)`,
      );
    }
  }

  return tradeoffs.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

function generateRecommendations(
  comparisons: ScenarioComparison[],
  alternatives: SimulationScenario[],
): WhatIfRecommendation[] {
  const recs: WhatIfRecommendation[] = [];

  for (const comp of comparisons) {
    if (comp.verdict !== 'recommended') continue;

    const alt = alternatives.find((a) => a.id === comp.alternativeId);
    if (!alt) continue;

    for (const change of alt.changes) {
      const bestGain = comp.gains.sort((a, b) => b.magnitudePercent - a.magnitudePercent)[0];
      if (!bestGain) continue;

      recs.push({
        id: uuid(),
        category: axisToCategory(change.axis),
        title: `Consider: ${change.axis} → ${String(change.toValue)}`,
        description: change.rationale,
        expectedImpact: bestGain,
        change,
        priority: comp.scoreDelta,
      });
    }
  }

  recs.sort((a, b) => b.priority - a.priority);
  return recs.slice(0, 10);
}

function axisToCategory(axis: SimulationAxis): RecommendationCategory {
  switch (axis) {
    case SimulationAxis.CHANNEL: return RecommendationCategory.CHANNEL;
    case SimulationAxis.CADENCE:
    case SimulationAxis.CAMPAIGN_DURATION: return RecommendationCategory.SCHEDULING;
    case SimulationAxis.GOAL_PRIORITY: return RecommendationCategory.STRATEGY;
    case SimulationAxis.AUTONOMY_LEVEL: return RecommendationCategory.GOVERNANCE;
    case SimulationAxis.OUTPUT_MIX:
    case SimulationAxis.VARIANT_COUNT:
    case SimulationAxis.PRESET_TEMPLATE: return RecommendationCategory.CONTENT;
    case SimulationAxis.AUTO_PUBLISH: return RecommendationCategory.CAMPAIGN;
    default: return RecommendationCategory.STRATEGY;
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function buildSimulationSummary(
  baseline: SimulationScenario,
  alternatives: SimulationScenario[],
  comparisons: ScenarioComparison[],
): string {
  const recommended = comparisons.filter((c) => c.verdict === 'recommended');
  const notRecommended = comparisons.filter((c) => c.verdict === 'not_recommended');

  const parts: string[] = [
    `Simulation completed: baseline score ${baseline.overallScore}, ${alternatives.length} alternative(s) evaluated.`,
  ];

  if (recommended.length > 0) {
    parts.push(`${recommended.length} scenario(s) recommended over baseline.`);
  }
  if (notRecommended.length > 0) {
    parts.push(`${notRecommended.length} scenario(s) not recommended.`);
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function saveSimulation(
  result: SimulationResult,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  try {
    await supabase.upsert(SIMULATIONS_TABLE, {
      id: result.id,
      tenant_id: result.tenantId,
      status: result.status,
      baseline: JSON.stringify(result.baseline),
      alternatives: JSON.stringify(result.alternatives),
      comparisons: JSON.stringify(result.comparisons),
      recommendations: JSON.stringify(result.recommendations),
      summary: result.summary,
      caveats: JSON.stringify(result.caveats),
      created_at: result.createdAt,
      completed_at: result.completedAt,
      duration_ms: result.durationMs,
    }, 'id');
  } catch {
    logger.warn(`[ImpactEstimator] Failed to persist simulation ${result.id}`);
  }
}

/**
 * Loads a saved simulation by ID.
 */
export async function loadSimulation(
  simulationId: string,
  supabase: SupabaseClient | null,
): Promise<SimulationResult | null> {
  if (!supabase) return null;

  try {
    const rows = await supabase.select<Record<string, unknown>>(SIMULATIONS_TABLE, {
      filters: [{ column: 'id', operator: 'eq', value: simulationId }],
      limit: 1,
    });

    if (rows.length === 0) return null;

    return mapRowToSimulation(rows[0]);
  } catch {
    return null;
  }
}

/**
 * Lists recent simulations for a tenant.
 */
export async function listSimulations(
  tenantId: string | null,
  supabase: SupabaseClient | null,
  limit = 20,
): Promise<SimulationResult[]> {
  if (!supabase) return [];

  type Filter = { column: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'in'; value: string | number | boolean | null };
  const filters: Filter[] = [];
  if (tenantId) {
    filters.push({ column: 'tenant_id', operator: 'eq', value: tenantId });
  }

  try {
    const rows = await supabase.select<Record<string, unknown>>(SIMULATIONS_TABLE, {
      filters,
      orderBy: 'created_at',
      orderDesc: true,
      limit,
    });

    return rows.map(mapRowToSimulation);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Row Mapper
// ---------------------------------------------------------------------------

function mapRowToSimulation(row: Record<string, unknown>): SimulationResult {
  function parseJson<T>(val: unknown, fallback: T): T {
    if (!val) return fallback;
    try {
      return typeof val === 'string' ? JSON.parse(val) : val as T;
    } catch {
      return fallback;
    }
  }

  return {
    id: row['id'] as string,
    tenantId: (row['tenant_id'] as string) ?? null,
    status: (row['status'] as SimulationStatus) ?? SimulationStatus.COMPLETED,
    baseline: parseJson(row['baseline'], {} as SimulationScenario),
    alternatives: parseJson(row['alternatives'], []),
    comparisons: parseJson(row['comparisons'], []),
    recommendations: parseJson(row['recommendations'], []),
    summary: (row['summary'] as string) ?? '',
    caveats: parseJson(row['caveats'], []),
    createdAt: row['created_at'] as string,
    completedAt: (row['completed_at'] as string) ?? null,
    durationMs: (row['duration_ms'] as number) ?? 0,
  };
}
