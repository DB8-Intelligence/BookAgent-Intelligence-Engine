/**
 * Improvement Engine — Continuous Improvement Loop
 *
 * Analisa métricas de performance, gera insights, propõe ações
 * de otimização e executa ciclos de melhoria contínua.
 *
 * Fluxo:
 *   1. Coletar métricas (performance-analyzer)
 *   2. Gerar insights (gaps, tendências, anomalias)
 *   3. Propor ações de otimização
 *   4. Construir health indicators
 *   5. Calcular overall score
 *   6. Persistir ciclo
 *
 * Parte 99: Continuous Improvement Loop / Meta-Optimization
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  ImprovementCycle,
  SystemPerformanceMetric,
  MetaInsight,
  OptimizationAction,
  SystemHealthIndicator,
} from '../../domain/entities/meta-optimization.js';
import {
  CycleStatus,
  PerformanceDimension,
  MetaActionType,
  OptimizationActionStatus,
  MetaInsightSeverity,
  HealthStatus,
  DEFAULT_TARGETS,
} from '../../domain/entities/meta-optimization.js';
import { analyzePerformance } from './performance-analyzer.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const CYCLES_TABLE = 'bookagent_improvement_cycles';

// ---------------------------------------------------------------------------
// Main Entry: Run Cycle
// ---------------------------------------------------------------------------

/**
 * Runs a complete improvement cycle for a tenant.
 */
export async function runImprovementCycle(
  tenantId: string | null,
  supabase: SupabaseClient | null,
): Promise<ImprovementCycle> {
  const startMs = Date.now();
  const now = new Date().toISOString();

  // 1. Collect metrics
  const metrics = await analyzePerformance(tenantId, supabase);

  // 2. Load previous cycle for trend comparison
  const previous = await loadLatestCycle(tenantId, supabase);
  if (previous) {
    applyTrends(metrics, previous.metrics);
  }

  // 3. Generate insights
  const insights = generateInsights(metrics);

  // 4. Propose actions
  const actions = proposeActions(insights, metrics);

  // 5. Build health indicators
  const healthIndicators = buildHealthIndicators(metrics);

  // 6. Calculate overall score
  const overallScore = computeOverallScore(metrics);
  const previousScore = previous?.overallScore ?? null;
  const scoreDelta = previousScore != null ? overallScore - previousScore : 0;

  // 7. Build summary
  const summary = buildSummary(metrics, insights, actions, overallScore, scoreDelta);

  const durationMs = Date.now() - startMs;

  const cycle: ImprovementCycle = {
    id: uuid(),
    tenantId,
    status: CycleStatus.COMPLETED,
    metrics,
    insights,
    actions,
    healthIndicators,
    summary,
    overallScore,
    previousScore,
    scoreDelta,
    startedAt: now,
    completedAt: new Date().toISOString(),
    durationMs,
  };

  // 8. Persist
  await saveCycle(cycle, supabase);

  logger.info(
    `[MetaOptimization] Cycle ${cycle.id}: score=${overallScore} ` +
    `delta=${scoreDelta >= 0 ? '+' : ''}${scoreDelta} ` +
    `insights=${insights.length} actions=${actions.length} ` +
    `${durationMs}ms`,
  );

  return cycle;
}

// ---------------------------------------------------------------------------
// Trend Application
// ---------------------------------------------------------------------------

function applyTrends(
  current: SystemPerformanceMetric[],
  previous: SystemPerformanceMetric[],
): void {
  for (const metric of current) {
    const prev = previous.find((p) => p.dimension === metric.dimension);
    if (prev) {
      metric.previousValue = prev.currentValue;
      const delta = metric.currentValue - prev.currentValue;
      if (delta > 3) metric.trend = 'improving';
      else if (delta < -3) metric.trend = 'declining';
      else metric.trend = 'stable';
    }
  }
}

// ---------------------------------------------------------------------------
// Insight Generation
// ---------------------------------------------------------------------------

function generateInsights(metrics: SystemPerformanceMetric[]): MetaInsight[] {
  const insights: MetaInsight[] = [];

  for (const m of metrics) {
    // Large gap from target
    if (m.gap > 25 && m.sampleSize > 0) {
      insights.push({
        id: uuid(),
        dimension: m.dimension,
        severity: m.gap > 40 ? MetaInsightSeverity.WARNING : MetaInsightSeverity.SUGGESTION,
        title: `${m.dimension} below target`,
        description: `Current ${m.currentValue}% vs target ${m.targetValue}% (gap: ${m.gap}pp). ` +
          `Sample size: ${m.sampleSize}.`,
        evidence: [`current=${m.currentValue}`, `target=${m.targetValue}`, `gap=${m.gap}`],
        suggestedAction: dimensionToAction(m.dimension),
        expectedImpact: `Closing this gap could improve overall score by ~${Math.round(m.gap / metrics.length)}pp`,
      });
    }

    // Declining trend
    if (m.trend === 'declining' && m.previousValue != null) {
      const drop = m.previousValue - m.currentValue;
      insights.push({
        id: uuid(),
        dimension: m.dimension,
        severity: drop > 15 ? MetaInsightSeverity.WARNING : MetaInsightSeverity.INFO,
        title: `${m.dimension} declining`,
        description: `Dropped from ${m.previousValue}% to ${m.currentValue}% (${drop}pp decline).`,
        evidence: [`previous=${m.previousValue}`, `current=${m.currentValue}`, `drop=${drop}`],
        suggestedAction: dimensionToAction(m.dimension),
        expectedImpact: `Reversing this trend could recover ${drop}pp`,
      });
    }

    // Very high (above target by 20+) — reinforce
    if (m.currentValue > m.targetValue + 20 && m.sampleSize >= 10) {
      insights.push({
        id: uuid(),
        dimension: m.dimension,
        severity: MetaInsightSeverity.INFO,
        title: `${m.dimension} exceeding target`,
        description: `Current ${m.currentValue}% exceeds target ${m.targetValue}% by ${Math.abs(m.gap)}pp. ` +
          `Current strategy is working well.`,
        evidence: [`current=${m.currentValue}`, `target=${m.targetValue}`],
        suggestedAction: MetaActionType.REINFORCE_RULE,
        expectedImpact: 'Reinforce current configuration to maintain this performance',
      });
    }
  }

  // Cross-dimensional: high retry + low recovery = systemic issue
  const retryMetric = metrics.find((m) => m.dimension === PerformanceDimension.RETRY_RATE);
  const recoveryMetric = metrics.find((m) => m.dimension === PerformanceDimension.RECOVERY_EFFECTIVENESS);
  if (retryMetric && recoveryMetric &&
      retryMetric.currentValue < 50 && recoveryMetric.currentValue < 50) {
    insights.push({
      id: uuid(),
      dimension: PerformanceDimension.RECOVERY_EFFECTIVENESS,
      severity: MetaInsightSeverity.CRITICAL,
      title: 'Systemic reliability issue',
      description: `Both retry rate (${retryMetric.currentValue}%) and recovery effectiveness ` +
        `(${recoveryMetric.currentValue}%) are low — the system is failing and not recovering well.`,
      evidence: [
        `retry_score=${retryMetric.currentValue}`,
        `recovery_score=${recoveryMetric.currentValue}`,
      ],
      suggestedAction: MetaActionType.ADJUST_RETRY_POLICY,
      expectedImpact: 'Adjusting retry policies could improve both dimensions simultaneously',
    });
  }

  return insights;
}

function dimensionToAction(dim: PerformanceDimension): MetaActionType {
  switch (dim) {
    case PerformanceDimension.CAMPAIGN_SUCCESS_RATE: return MetaActionType.ADJUST_STRATEGY;
    case PerformanceDimension.PUBLICATION_SUCCESS_RATE: return MetaActionType.SUGGEST_CONFIG_CHANGE;
    case PerformanceDimension.DECISION_ACCURACY: return MetaActionType.ADJUST_THRESHOLD;
    case PerformanceDimension.RECOVERY_EFFECTIVENESS: return MetaActionType.ADJUST_RETRY_POLICY;
    case PerformanceDimension.COST_EFFICIENCY: return MetaActionType.ADJUST_COST_TARGET;
    case PerformanceDimension.EXECUTION_LATENCY: return MetaActionType.ADJUST_PRIORITY;
    case PerformanceDimension.QUALITY_SCORE_AVG: return MetaActionType.ADJUST_THRESHOLD;
    case PerformanceDimension.RETRY_RATE: return MetaActionType.ADJUST_RETRY_POLICY;
    case PerformanceDimension.ESCALATION_RATE: return MetaActionType.ADJUST_STRATEGY;
    case PerformanceDimension.GOVERNANCE_PASS_RATE: return MetaActionType.SUGGEST_CONFIG_CHANGE;
    default: return MetaActionType.SUGGEST_CONFIG_CHANGE;
  }
}

// ---------------------------------------------------------------------------
// Action Proposal
// ---------------------------------------------------------------------------

function proposeActions(
  insights: MetaInsight[],
  metrics: SystemPerformanceMetric[],
): OptimizationAction[] {
  const actions: OptimizationAction[] = [];
  const now = new Date().toISOString();

  // Only propose actions for WARNING+ insights with suggested actions
  const actionable = insights.filter(
    (i) => i.suggestedAction &&
      (i.severity === MetaInsightSeverity.WARNING || i.severity === MetaInsightSeverity.CRITICAL),
  );

  for (const insight of actionable) {
    if (!insight.suggestedAction) continue;

    const metric = metrics.find((m) => m.dimension === insight.dimension);
    const currentVal = metric ? String(metric.currentValue) : 'unknown';
    const targetVal = metric ? String(metric.targetValue) : 'unknown';

    actions.push({
      id: uuid(),
      type: insight.suggestedAction,
      status: OptimizationActionStatus.PROPOSED,
      target: insight.dimension,
      fromValue: currentVal,
      toValue: targetVal,
      rationale: insight.description,
      expectedImpact: insight.expectedImpact,
      observedImpact: null,
      createdAt: now,
      appliedAt: null,
    });
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Health Indicators
// ---------------------------------------------------------------------------

function buildHealthIndicators(metrics: SystemPerformanceMetric[]): SystemHealthIndicator[] {
  return metrics.map((m) => {
    let status: HealthStatus;
    if (m.gap <= 0) status = HealthStatus.HEALTHY;
    else if (m.gap <= 20) status = HealthStatus.HEALTHY;
    else if (m.gap <= 40) status = HealthStatus.WARNING;
    else status = HealthStatus.CRITICAL;

    if (m.sampleSize === 0) status = HealthStatus.UNKNOWN;

    return {
      dimension: m.dimension,
      status,
      value: `${m.currentValue}%`,
      detail: m.sampleSize > 0
        ? `Target: ${m.targetValue}%, Gap: ${m.gap}pp, Samples: ${m.sampleSize}`
        : 'No data available',
      trend: m.trend,
    };
  });
}

// ---------------------------------------------------------------------------
// Overall Score
// ---------------------------------------------------------------------------

function computeOverallScore(metrics: SystemPerformanceMetric[]): number {
  const withData = metrics.filter((m) => m.sampleSize > 0);
  if (withData.length === 0) return 50;
  const sum = withData.reduce((s, m) => s + m.currentValue, 0);
  return Math.round(sum / withData.length);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function buildSummary(
  metrics: SystemPerformanceMetric[],
  insights: MetaInsight[],
  actions: OptimizationAction[],
  score: number,
  delta: number,
): string {
  const parts: string[] = [];

  parts.push(`Overall system score: ${score}/100`);
  if (delta !== 0) {
    parts.push(`(${delta >= 0 ? '+' : ''}${delta} from last cycle)`);
  }

  const warnings = insights.filter((i) => i.severity === MetaInsightSeverity.WARNING).length;
  const critical = insights.filter((i) => i.severity === MetaInsightSeverity.CRITICAL).length;

  if (critical > 0) parts.push(`${critical} critical issue(s) detected`);
  if (warnings > 0) parts.push(`${warnings} warning(s)`);
  if (actions.length > 0) parts.push(`${actions.length} optimization action(s) proposed`);

  const declining = metrics.filter((m) => m.trend === 'declining').length;
  const improving = metrics.filter((m) => m.trend === 'improving').length;

  if (declining > 0) parts.push(`${declining} dimension(s) declining`);
  if (improving > 0) parts.push(`${improving} dimension(s) improving`);

  return parts.join('. ') + '.';
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function saveCycle(
  cycle: ImprovementCycle,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.upsert(CYCLES_TABLE, {
      id: cycle.id,
      tenant_id: cycle.tenantId,
      status: cycle.status,
      metrics: JSON.stringify(cycle.metrics),
      insights: JSON.stringify(cycle.insights),
      actions: JSON.stringify(cycle.actions),
      health_indicators: JSON.stringify(cycle.healthIndicators),
      summary: cycle.summary,
      overall_score: cycle.overallScore,
      previous_score: cycle.previousScore,
      score_delta: cycle.scoreDelta,
      started_at: cycle.startedAt,
      completed_at: cycle.completedAt,
      duration_ms: cycle.durationMs,
    }, 'id');
  } catch {
    logger.warn(`[MetaOptimization] Failed to persist cycle ${cycle.id}`);
  }
}

export async function loadLatestCycle(
  tenantId: string | null,
  supabase: SupabaseClient | null,
): Promise<ImprovementCycle | null> {
  if (!supabase) return null;
  type Filter = { column: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'in'; value: string | number | boolean | null };
  const filters: Filter[] = [];
  if (tenantId) filters.push({ column: 'tenant_id', operator: 'eq', value: tenantId });

  try {
    const rows = await supabase.select<Record<string, unknown>>(CYCLES_TABLE, {
      filters,
      orderBy: 'started_at',
      orderDesc: true,
      limit: 1,
    });
    if (rows.length === 0) return null;
    return mapRow(rows[0]);
  } catch {
    return null;
  }
}

export async function listCycles(
  tenantId: string | null,
  supabase: SupabaseClient | null,
  limit = 20,
): Promise<ImprovementCycle[]> {
  if (!supabase) return [];
  type Filter = { column: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'in'; value: string | number | boolean | null };
  const filters: Filter[] = [];
  if (tenantId) filters.push({ column: 'tenant_id', operator: 'eq', value: tenantId });

  try {
    const rows = await supabase.select<Record<string, unknown>>(CYCLES_TABLE, {
      filters,
      orderBy: 'started_at',
      orderDesc: true,
      limit,
    });
    return rows.map(mapRow);
  } catch {
    return [];
  }
}

function mapRow(r: Record<string, unknown>): ImprovementCycle {
  function pj<T>(v: unknown, fb: T): T {
    if (!v) return fb;
    try { return typeof v === 'string' ? JSON.parse(v) : v as T; }
    catch { return fb; }
  }
  return {
    id: r['id'] as string,
    tenantId: (r['tenant_id'] as string) ?? null,
    status: (r['status'] as CycleStatus) ?? CycleStatus.COMPLETED,
    metrics: pj(r['metrics'], []),
    insights: pj(r['insights'], []),
    actions: pj(r['actions'], []),
    healthIndicators: pj(r['health_indicators'], []),
    summary: (r['summary'] as string) ?? '',
    overallScore: (r['overall_score'] as number) ?? 0,
    previousScore: (r['previous_score'] as number) ?? null,
    scoreDelta: (r['score_delta'] as number) ?? 0,
    startedAt: r['started_at'] as string,
    completedAt: (r['completed_at'] as string) ?? null,
    durationMs: (r['duration_ms'] as number) ?? 0,
  };
}
