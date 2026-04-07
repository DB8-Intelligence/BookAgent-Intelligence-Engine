/**
 * Optimization Engine — Goal-Driven Campaign Optimization
 *
 * Avalia campanhas em andamento contra suas metas, coleta signals
 * de performance e gera recomendações de otimização.
 *
 * Fluxo:
 *   1. Coletar signals (publications, scores, timing, etc.)
 *   2. Avaliar progresso de cada goal
 *   3. Determinar saúde da campanha
 *   4. Gerar recomendações táticas
 *   5. Produzir OptimizationCycle
 *
 * Parte 89: Goal-Driven Campaign Optimization
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  CampaignGoal,
  GoalMetricSnapshot,
  OptimizationSignal,
  OptimizationRecommendation,
  OptimizationCycle,
} from '../../domain/entities/campaign-optimization.js';
import {
  GoalMetricType,
  CampaignHealth,
  OptimizationActionType,
  OptimizationImpact,
  CAMPAIGN_HEALTH_LABELS,
} from '../../domain/entities/campaign-optimization.js';
import type { ContentCampaign } from '../../domain/entities/campaign.js';
import { CampaignItemStatus } from '../../domain/entities/campaign.js';
import type { CampaignSchedule } from '../../domain/entities/schedule.js';
import { ScheduleItemStatus } from '../../domain/entities/schedule.js';
import type { TenantContext } from '../../domain/entities/tenant.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const TABLE = 'bookagent_campaign_optimizations';

export async function saveOptimizationCycle(
  cycle: OptimizationCycle,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  await supabase.upsert(TABLE, {
    id: cycle.id,
    campaign_id: cycle.campaignId,
    tenant_id: cycle.tenantId,
    goals: cycle.goals,
    metric_snapshots: cycle.metricSnapshots,
    signals: cycle.signals,
    overall_health: cycle.overallHealth,
    recommendations: cycle.recommendations,
    summary: cycle.summary,
    evaluated_at: cycle.evaluatedAt,
    next_evaluation_at: cycle.nextEvaluationAt,
  });
}

export async function listOptimizationCycles(
  campaignId: string,
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<OptimizationCycle[]> {
  if (!supabase) return [];

  const rows = await supabase.select<Record<string, unknown>>(TABLE, {
    filters: [
      { column: 'campaign_id', operator: 'eq', value: campaignId },
      { column: 'tenant_id', operator: 'eq', value: tenantId },
    ],
    orderBy: 'evaluated_at',
    orderDesc: true,
  });

  return rows.map(mapRowToCycle);
}

export async function getLatestOptimization(
  campaignId: string,
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<OptimizationCycle | null> {
  if (!supabase) return null;

  const rows = await supabase.select<Record<string, unknown>>(TABLE, {
    filters: [
      { column: 'campaign_id', operator: 'eq', value: campaignId },
      { column: 'tenant_id', operator: 'eq', value: tenantId },
    ],
    orderBy: 'evaluated_at',
    orderDesc: true,
    limit: 1,
  });

  if (rows.length === 0) return null;
  return mapRowToCycle(rows[0]!);
}

// ---------------------------------------------------------------------------
// Goal Generation (from campaign context)
// ---------------------------------------------------------------------------

/**
 * Generates default goals for a campaign based on its objective and items.
 */
export function generateDefaultGoals(campaign: ContentCampaign): CampaignGoal[] {
  const goals: CampaignGoal[] = [];
  const deadline = campaign.plannedStartAt
    ? new Date(campaign.plannedStartAt.getTime() + campaign.plannedDurationDays * 86400000).toISOString()
    : new Date(Date.now() + campaign.plannedDurationDays * 86400000).toISOString();

  // Goal 1: Publication completion
  goals.push({
    id: uuid(),
    campaignId: campaign.id,
    name: 'Publicações completas',
    description: `Publicar todos os ${campaign.items.length} itens da campanha`,
    metricType: GoalMetricType.COUNT,
    metricKey: 'publications_completed',
    targetValue: campaign.items.length,
    currentValue: campaign.counts.published,
    deadline,
    progressPercent: campaign.items.length > 0
      ? Math.round((campaign.counts.published / campaign.items.length) * 100)
      : 0,
    health: CampaignHealth.INSUFFICIENT_DATA,
  });

  // Goal 2: Quality threshold
  goals.push({
    id: uuid(),
    campaignId: campaign.id,
    name: 'Qualidade acima do threshold',
    description: 'Manter quality score médio acima de 70',
    metricType: GoalMetricType.SCORE,
    metricKey: 'avg_quality_score',
    targetValue: 70,
    currentValue: 0,
    deadline,
    progressPercent: 0,
    health: CampaignHealth.INSUFFICIENT_DATA,
  });

  // Goal 3: No failures
  goals.push({
    id: uuid(),
    campaignId: campaign.id,
    name: 'Zero falhas',
    description: 'Completar campanha sem falhas de publicação',
    metricType: GoalMetricType.RATE,
    metricKey: 'success_rate',
    targetValue: 100,
    currentValue: campaign.counts.total > 0
      ? Math.round(((campaign.counts.total - campaign.counts.failed) / campaign.counts.total) * 100)
      : 100,
    deadline,
    progressPercent: 0,
    health: CampaignHealth.INSUFFICIENT_DATA,
  });

  return goals;
}

// ---------------------------------------------------------------------------
// Signal Collection
// ---------------------------------------------------------------------------

/**
 * Collects optimization signals from campaign and schedule state.
 */
export function collectSignals(
  campaign: ContentCampaign,
  schedule: CampaignSchedule | null,
): OptimizationSignal[] {
  const signals: OptimizationSignal[] = [];
  const now = new Date().toISOString();

  // Publication success/failure signals from campaign items
  for (const item of campaign.items) {
    if (item.status === CampaignItemStatus.PUBLISHED) {
      signals.push({
        type: 'publication_success',
        value: 1,
        referenceId: item.id,
        context: { format: item.format, channel: item.channel },
        collectedAt: now,
      });
    }
    if (item.status === CampaignItemStatus.FAILED) {
      signals.push({
        type: 'publication_failure',
        value: 1,
        referenceId: item.id,
        context: { format: item.format, channel: item.channel },
        collectedAt: now,
      });
    }
  }

  // Timing signals from schedule
  if (schedule) {
    for (const si of schedule.items) {
      if (si.status === ScheduleItemStatus.DELAYED) {
        signals.push({
          type: 'timing',
          value: -1,
          referenceId: si.id,
          context: { format: si.format, channel: si.channel, reason: 'delayed' },
          collectedAt: now,
        });
      }
      if (si.status === ScheduleItemStatus.EXECUTED && si.executedAt) {
        const planned = new Date(si.window.plannedAt).getTime();
        const actual = new Date(si.executedAt).getTime();
        const deviationHours = (actual - planned) / 3600000;
        signals.push({
          type: 'timing',
          value: deviationHours,
          referenceId: si.id,
          context: { format: si.format, channel: si.channel, reason: 'deviation' },
          collectedAt: now,
        });
      }
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Goal Evaluation
// ---------------------------------------------------------------------------

/**
 * Updates goal progress and health based on current campaign state.
 */
export function evaluateGoals(
  goals: CampaignGoal[],
  campaign: ContentCampaign,
  signals: OptimizationSignal[],
): CampaignGoal[] {
  const now = new Date();

  return goals.map((goal) => {
    const updated = { ...goal };

    // Update current value based on metric key
    switch (goal.metricKey) {
      case 'publications_completed':
        updated.currentValue = campaign.counts.published;
        break;
      case 'success_rate':
        updated.currentValue = campaign.counts.total > 0
          ? Math.round(((campaign.counts.total - campaign.counts.failed) / campaign.counts.total) * 100)
          : 100;
        break;
      case 'avg_quality_score':
        // Quality score would come from scoring module — use signals
        const qualitySignals = signals.filter((s) => s.type === 'quality_score');
        if (qualitySignals.length > 0) {
          updated.currentValue = Math.round(
            qualitySignals.reduce((sum, s) => sum + s.value, 0) / qualitySignals.length,
          );
        }
        break;
    }

    // Calculate progress
    updated.progressPercent = goal.targetValue > 0
      ? Math.min(100, Math.round((updated.currentValue / goal.targetValue) * 100))
      : 0;

    // Determine health
    updated.health = determineGoalHealth(updated, now);

    return updated;
  });
}

function determineGoalHealth(goal: CampaignGoal, now: Date): CampaignHealth {
  if (goal.currentValue <= 0 && goal.targetValue > 0) {
    return CampaignHealth.INSUFFICIENT_DATA;
  }

  const deadline = new Date(goal.deadline);
  const totalDuration = deadline.getTime() - (now.getTime() - 30 * 86400000); // rough start estimate
  const elapsed = now.getTime() - (deadline.getTime() - totalDuration);
  const timeProgress = totalDuration > 0 ? Math.min(100, (elapsed / totalDuration) * 100) : 100;

  // Compare metric progress vs time progress
  const progressRatio = timeProgress > 0 ? goal.progressPercent / timeProgress : 1;

  if (goal.progressPercent >= 100) return CampaignHealth.OVERPERFORMING;
  if (progressRatio >= 0.9) return CampaignHealth.ON_TRACK;
  if (progressRatio >= 0.5) return CampaignHealth.AT_RISK;
  return CampaignHealth.OFF_TRACK;
}

// ---------------------------------------------------------------------------
// Metric Snapshots
// ---------------------------------------------------------------------------

function buildMetricSnapshots(
  goals: CampaignGoal[],
  previousSnapshots: GoalMetricSnapshot[],
): GoalMetricSnapshot[] {
  const now = new Date().toISOString();

  return goals.map((goal) => {
    const prev = previousSnapshots.find((s) => s.metricKey === goal.metricKey);
    const trend: GoalMetricSnapshot['trend'] = prev
      ? goal.currentValue > prev.value
        ? 'improving'
        : goal.currentValue < prev.value
          ? 'declining'
          : 'stable'
      : 'stable';

    return {
      metricKey: goal.metricKey,
      value: goal.currentValue,
      target: goal.targetValue,
      progressPercent: goal.progressPercent,
      trend,
      projectedToHit: goal.health === CampaignHealth.ON_TRACK ||
                       goal.health === CampaignHealth.OVERPERFORMING,
      measuredAt: now,
    };
  });
}

// ---------------------------------------------------------------------------
// Recommendation Generation
// ---------------------------------------------------------------------------

function generateRecommendations(
  goals: CampaignGoal[],
  signals: OptimizationSignal[],
  campaign: ContentCampaign,
): OptimizationRecommendation[] {
  const recs: OptimizationRecommendation[] = [];

  // Check overall health
  const offTrack = goals.filter((g) => g.health === CampaignHealth.OFF_TRACK);
  const atRisk = goals.filter((g) => g.health === CampaignHealth.AT_RISK);
  const overperforming = goals.filter((g) => g.health === CampaignHealth.OVERPERFORMING);

  // All good
  if (offTrack.length === 0 && atRisk.length === 0) {
    recs.push({
      id: uuid(),
      action: OptimizationActionType.MAINTAIN_COURSE,
      title: 'Manter rumo atual',
      description: 'Campanha está progredindo conforme esperado. Manter frequência e formatos atuais.',
      impact: OptimizationImpact.LOW,
      confidence: 80,
      supportingData: goals.map((g) => ({ metric: g.name, value: `${g.progressPercent}%` })),
      applied: false,
    });
    return recs;
  }

  // Publication completion off track
  const pubGoal = goals.find((g) => g.metricKey === 'publications_completed');
  if (pubGoal && (pubGoal.health === CampaignHealth.OFF_TRACK || pubGoal.health === CampaignHealth.AT_RISK)) {
    const delayedSignals = signals.filter((s) => s.type === 'timing' && s.value < 0);
    const failedSignals = signals.filter((s) => s.type === 'publication_failure');

    if (failedSignals.length > 0) {
      recs.push({
        id: uuid(),
        action: OptimizationActionType.CHANGE_FORMAT,
        title: 'Revisar formatos com falha',
        description: `${failedSignals.length} publicação(ões) falharam. Considere mudar formato ou template dos itens pendentes.`,
        impact: OptimizationImpact.HIGH,
        confidence: 70,
        supportingData: [
          { metric: 'Falhas', value: String(failedSignals.length) },
          { metric: 'Publicados', value: String(pubGoal.currentValue) },
          { metric: 'Meta', value: String(pubGoal.targetValue) },
        ],
        applied: false,
      });
    }

    if (delayedSignals.length > 0) {
      recs.push({
        id: uuid(),
        action: OptimizationActionType.CHANGE_TIMING,
        title: 'Ajustar horários de publicação',
        description: `${delayedSignals.length} item(ns) atrasado(s). Considere ajustar horários ou remover dependências.`,
        impact: OptimizationImpact.MEDIUM,
        confidence: 65,
        supportingData: [
          { metric: 'Atrasados', value: String(delayedSignals.length) },
        ],
        applied: false,
      });
    }

    // If heavily off track, suggest extending
    if (pubGoal.health === CampaignHealth.OFF_TRACK && pubGoal.progressPercent < 30) {
      recs.push({
        id: uuid(),
        action: OptimizationActionType.EXTEND_DURATION,
        title: 'Estender duração da campanha',
        description: `Progresso de ${pubGoal.progressPercent}% — considere estender a duração para atingir a meta.`,
        impact: OptimizationImpact.HIGH,
        confidence: 60,
        supportingData: [
          { metric: 'Progresso', value: `${pubGoal.progressPercent}%` },
        ],
        applied: false,
      });
    }
  }

  // Quality score off track
  const qualityGoal = goals.find((g) => g.metricKey === 'avg_quality_score');
  if (qualityGoal && qualityGoal.health === CampaignHealth.OFF_TRACK) {
    recs.push({
      id: uuid(),
      action: OptimizationActionType.CHANGE_TEMPLATE,
      title: 'Melhorar qualidade dos outputs',
      description: `Score médio de ${qualityGoal.currentValue} (meta: ${qualityGoal.targetValue}). Considere trocar templates ou estilos.`,
      impact: OptimizationImpact.MEDIUM,
      confidence: 55,
      supportingData: [
        { metric: 'Score atual', value: String(qualityGoal.currentValue) },
        { metric: 'Meta', value: String(qualityGoal.targetValue) },
      ],
      applied: false,
    });
  }

  // Overperforming → suggest increase
  if (overperforming.length > 0) {
    recs.push({
      id: uuid(),
      action: OptimizationActionType.INCREASE_FREQUENCY,
      title: 'Aumentar frequência — performance acima do esperado',
      description: 'A campanha está superando as metas. Considere aumentar a frequência para maximizar resultados.',
      impact: OptimizationImpact.MEDIUM,
      confidence: 60,
      supportingData: overperforming.map((g) => ({
        metric: g.name,
        value: `${g.progressPercent}% (meta: ${g.targetValue})`,
      })),
      applied: false,
    });
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Run Optimization Cycle
// ---------------------------------------------------------------------------

/**
 * Runs a full optimization cycle for a campaign.
 */
export async function runOptimizationCycle(
  campaign: ContentCampaign,
  schedule: CampaignSchedule | null,
  tenantCtx: TenantContext,
  existingGoals: CampaignGoal[] | null,
  supabase: SupabaseClient | null,
): Promise<OptimizationCycle> {
  const cycleId = uuid();
  const now = new Date().toISOString();

  // 1. Generate or use existing goals
  const goals = existingGoals ?? generateDefaultGoals(campaign);

  // 2. Collect signals
  const signals = collectSignals(campaign, schedule);

  // 3. Evaluate goals against current state
  const evaluatedGoals = evaluateGoals(goals, campaign, signals);

  // 4. Build metric snapshots (no previous for now)
  const metricSnapshots = buildMetricSnapshots(evaluatedGoals, []);

  // 5. Determine overall health
  const overallHealth = determineOverallHealth(evaluatedGoals);

  // 6. Generate recommendations
  const recommendations = generateRecommendations(evaluatedGoals, signals, campaign);

  // 7. Build summary
  const summary = buildSummary(evaluatedGoals, overallHealth, recommendations);

  // 8. Next evaluation (24h from now)
  const nextEval = new Date(Date.now() + 24 * 3600000).toISOString();

  const cycle: OptimizationCycle = {
    id: cycleId,
    campaignId: campaign.id,
    tenantId: campaign.tenantId,
    goals: evaluatedGoals,
    metricSnapshots,
    signals,
    overallHealth,
    recommendations,
    summary,
    evaluatedAt: now,
    nextEvaluationAt: nextEval,
  };

  await saveOptimizationCycle(cycle, supabase);

  logger.info(
    `[OptimizationEngine] Cycle ${cycleId} for campaign=${campaign.id}: ` +
    `health=${overallHealth} goals=${evaluatedGoals.length} ` +
    `recs=${recommendations.length}`,
  );

  return cycle;
}

// ---------------------------------------------------------------------------
// Overall Health
// ---------------------------------------------------------------------------

function determineOverallHealth(goals: CampaignGoal[]): CampaignHealth {
  if (goals.length === 0) return CampaignHealth.INSUFFICIENT_DATA;

  const hasInsufficientData = goals.every((g) => g.health === CampaignHealth.INSUFFICIENT_DATA);
  if (hasInsufficientData) return CampaignHealth.INSUFFICIENT_DATA;

  const hasOffTrack = goals.some((g) => g.health === CampaignHealth.OFF_TRACK);
  if (hasOffTrack) return CampaignHealth.OFF_TRACK;

  const hasAtRisk = goals.some((g) => g.health === CampaignHealth.AT_RISK);
  if (hasAtRisk) return CampaignHealth.AT_RISK;

  const allOverperforming = goals.every(
    (g) => g.health === CampaignHealth.OVERPERFORMING || g.health === CampaignHealth.INSUFFICIENT_DATA,
  );
  if (allOverperforming) return CampaignHealth.OVERPERFORMING;

  return CampaignHealth.ON_TRACK;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function buildSummary(
  goals: CampaignGoal[],
  health: CampaignHealth,
  recs: OptimizationRecommendation[],
): string {
  const healthLabel = CAMPAIGN_HEALTH_LABELS[health];
  const goalSummaries = goals
    .filter((g) => g.health !== CampaignHealth.INSUFFICIENT_DATA)
    .map((g) => `${g.name}: ${g.progressPercent}%`)
    .join(', ');

  let summary = `Saúde da campanha: ${healthLabel}.`;
  if (goalSummaries) {
    summary += ` Progresso: ${goalSummaries}.`;
  }
  if (recs.length > 0) {
    summary += ` ${recs.length} recomendação(ões) gerada(s).`;
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Row Mapper
// ---------------------------------------------------------------------------

function mapRowToCycle(row: Record<string, unknown>): OptimizationCycle {
  return {
    id: row['id'] as string,
    campaignId: row['campaign_id'] as string,
    tenantId: row['tenant_id'] as string,
    goals: (row['goals'] ?? []) as CampaignGoal[],
    metricSnapshots: (row['metric_snapshots'] ?? []) as GoalMetricSnapshot[],
    signals: (row['signals'] ?? []) as OptimizationSignal[],
    overallHealth: row['overall_health'] as CampaignHealth,
    recommendations: (row['recommendations'] ?? []) as OptimizationRecommendation[],
    summary: row['summary'] as string,
    evaluatedAt: row['evaluated_at'] as string,
    nextEvaluationAt: row['next_evaluation_at'] as string,
  };
}
