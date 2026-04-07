/**
 * Signal Collector — Learning Engine
 *
 * Coleta sinais de aprendizado de múltiplas fontes:
 *   - Scoring (Parte 70): scores por dimensão
 *   - Experiments (Parte 72): resultados A/B
 *   - Reviews (Parte 68): feedback humano
 *   - Usage: formatos e presets mais usados
 *
 * Cada sinal é uma observação atômica que alimenta o aggregator.
 *
 * Parte 73: Learning Engine
 */

import { v4 as uuid } from 'uuid';

import type { LearningSignal } from '../../domain/entities/learning.js';
import { SignalSource, SignalType } from '../../domain/entities/learning.js';
import type { ContentScore } from '../../domain/entities/content-score.js';
import type { Experiment, ExperimentVariant } from '../../domain/entities/experiment.js';
import type { ReviewItem } from '../../domain/entities/review.js';
import { ReviewDecision } from '../../domain/entities/review.js';
import type { MediaPlan } from '../../domain/entities/media-plan.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Collect from Scoring (Parte 70)
// ---------------------------------------------------------------------------

/**
 * Extrai sinais de aprendizado a partir de ContentScores.
 * Cada dimensão gera um sinal separado.
 */
export function collectFromScoring(
  scores: ContentScore[],
  jobId: string,
): LearningSignal[] {
  const signals: LearningSignal[] = [];

  for (const score of scores) {
    // Sinal global do score
    signals.push(createSignal({
      source: SignalSource.SCORING,
      type: SignalType.QUALITY_SCORE,
      jobId,
      outputFormat: score.targetType,
      dimension: 'overall',
      value: score.score,
      context: {
        targetId: score.targetId,
        targetType: score.targetType,
        level: score.level,
        decision: score.decision,
      },
    }));

    // Sinais por dimensão
    for (const dim of score.breakdown.dimensions) {
      signals.push(createSignal({
        source: SignalSource.SCORING,
        type: SignalType.QUALITY_SCORE,
        jobId,
        outputFormat: score.targetType,
        dimension: dim.dimension,
        value: dim.score,
        context: {
          targetId: score.targetId,
          criteria: dim.criteria.map((c) => ({ name: c.name, score: c.score })),
        },
      }));
    }
  }

  logger.info(`[SignalCollector] Collected ${signals.length} signals from scoring (job=${jobId})`);
  return signals;
}

// ---------------------------------------------------------------------------
// Collect from Experiments (Parte 72)
// ---------------------------------------------------------------------------

/**
 * Extrai sinais de aprendizado a partir de experimentos concluídos.
 */
export function collectFromExperiment(experiment: Experiment): LearningSignal[] {
  const signals: LearningSignal[] = [];

  if (!experiment.result) return signals;

  const winner = experiment.variants.find((v) => v.isWinner);
  if (!winner) return signals;

  // Sinal do vencedor
  signals.push(createSignal({
    source: SignalSource.EXPERIMENT,
    type: SignalType.AB_RESULT,
    jobId: experiment.jobId,
    dimension: 'winner',
    value: winner.performance.compositeScore,
    context: {
      experimentId: experiment.id,
      winnerVariantId: winner.variantId,
      winnerGroup: winner.group,
      method: experiment.result.method,
      marginPercent: experiment.result.marginPercent,
      confidence: experiment.result.confidence,
      channel: winner.channel,
    },
  }));

  // Sinais de performance de cada variante
  for (const variant of experiment.variants) {
    if (variant.performance.views > 0) {
      signals.push(createSignal({
        source: SignalSource.EXPERIMENT,
        type: SignalType.PERFORMANCE_METRIC,
        jobId: experiment.jobId,
        dimension: 'variant_performance',
        value: variant.performance.compositeScore,
        context: {
          variantId: variant.variantId,
          group: variant.group,
          views: variant.performance.views,
          ctr: variant.performance.clickThroughRate,
          engagementRate: variant.performance.engagementRate,
          isWinner: variant.isWinner,
          channel: variant.channel,
        },
      }));
    }
  }

  logger.info(
    `[SignalCollector] Collected ${signals.length} signals from experiment ${experiment.id}`,
  );
  return signals;
}

// ---------------------------------------------------------------------------
// Collect from Reviews (Parte 68)
// ---------------------------------------------------------------------------

/**
 * Extrai sinais de aprendizado a partir de reviews.
 */
export function collectFromReviews(
  reviews: ReviewItem[],
  jobId: string,
): LearningSignal[] {
  const signals: LearningSignal[] = [];

  for (const review of reviews) {
    // Map decision to numeric value
    let value: number;
    switch (review.decision) {
      case ReviewDecision.APPROVED:
        value = 100;
        break;
      case ReviewDecision.ADJUSTMENT_REQUESTED:
        value = 50;
        break;
      case ReviewDecision.REJECTED:
        value = 0;
        break;
      case ReviewDecision.COMMENT:
        value = 70; // neutral-positive
        break;
      default:
        value = 50;
    }

    signals.push(createSignal({
      source: SignalSource.REVIEW,
      type: SignalType.REVIEW_FEEDBACK,
      jobId,
      dimension: review.targetType,
      value,
      context: {
        reviewId: review.id,
        decision: review.decision,
        targetType: review.targetType,
        artifactId: review.artifactId,
        variantId: review.variantId,
        channel: review.channel,
      },
      weight: review.decision === ReviewDecision.APPROVED || review.decision === ReviewDecision.REJECTED
        ? 1.0
        : 0.5,
    }));
  }

  logger.info(`[SignalCollector] Collected ${signals.length} signals from reviews (job=${jobId})`);
  return signals;
}

// ---------------------------------------------------------------------------
// Collect from Usage (MediaPlans)
// ---------------------------------------------------------------------------

/**
 * Extrai sinais de uso a partir de MediaPlans gerados.
 * Captura preferências de formato, duração, preset, layout.
 */
export function collectFromUsage(
  mediaPlans: MediaPlan[],
  jobId: string,
): LearningSignal[] {
  const signals: LearningSignal[] = [];

  for (const plan of mediaPlans) {
    // Format usage
    signals.push(createSignal({
      source: SignalSource.USAGE,
      type: SignalType.USAGE_PREFERENCE,
      jobId,
      outputFormat: plan.format,
      dimension: 'format',
      value: 1, // count
      context: {
        planId: plan.id,
        format: plan.format,
        narrativeType: plan.narrativeType,
        sceneCount: plan.scenes.length,
        totalDuration: plan.totalDurationSeconds,
        renderStatus: plan.renderStatus,
      },
    }));

    // Duration bucket
    if (plan.totalDurationSeconds !== null) {
      const bucket = durationBucket(plan.totalDurationSeconds);
      signals.push(createSignal({
        source: SignalSource.USAGE,
        type: SignalType.USAGE_PREFERENCE,
        jobId,
        outputFormat: plan.format,
        dimension: 'duration',
        value: plan.totalDurationSeconds,
        context: { bucket, format: plan.format },
      }));
    }

    // Layout distribution
    const layoutCounts = new Map<string, number>();
    for (const scene of plan.scenes) {
      layoutCounts.set(scene.layoutHint, (layoutCounts.get(scene.layoutHint) ?? 0) + 1);
    }
    const dominantLayout = [...layoutCounts.entries()]
      .sort(([, a], [, b]) => b - a)[0];

    if (dominantLayout) {
      signals.push(createSignal({
        source: SignalSource.USAGE,
        type: SignalType.USAGE_PREFERENCE,
        jobId,
        outputFormat: plan.format,
        dimension: 'layout',
        value: 1,
        context: {
          dominantLayout: dominantLayout[0],
          layoutDistribution: Object.fromEntries(layoutCounts),
        },
      }));
    }
  }

  logger.info(`[SignalCollector] Collected ${signals.length} signals from usage (job=${jobId})`);
  return signals;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CreateSignalInput {
  source: SignalSource;
  type: SignalType;
  jobId: string;
  tenantId?: string;
  outputFormat?: string;
  dimension: string;
  value: number;
  referenceValue?: number;
  context: Record<string, unknown>;
  weight?: number;
}

function createSignal(input: CreateSignalInput): LearningSignal {
  return {
    id: uuid(),
    source: input.source,
    type: input.type,
    jobId: input.jobId,
    tenantId: input.tenantId,
    outputFormat: input.outputFormat,
    dimension: input.dimension,
    value: input.value,
    referenceValue: input.referenceValue,
    context: input.context,
    weight: input.weight ?? 1.0,
    createdAt: new Date(),
  };
}

function durationBucket(seconds: number): string {
  if (seconds <= 15) return '0-15s';
  if (seconds <= 30) return '16-30s';
  if (seconds <= 60) return '31-60s';
  if (seconds <= 120) return '61-120s';
  return '120s+';
}
