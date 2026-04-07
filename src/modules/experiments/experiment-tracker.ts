/**
 * Experiment Tracker — A/B Testing Engine
 *
 * Rastreia eventos (views, clicks, engagement) e determina vencedores.
 * Persiste experimentos em bookagent_experiments.
 *
 * Lógica de seleção de vencedor:
 *   1. Com dados reais → composite score ponderado
 *   2. Sem dados reais → fallback para scoring interno (Parte 70)
 *   3. Manual → decisão do usuário
 *
 * Parte 72: A/B Testing Engine
 */

import type {
  Experiment,
  ExperimentResult,
  ExperimentVariant,
  VariantPerformance,
  TrackEventPayload,
  ExperimentWeights,
} from '../../domain/entities/experiment.js';
import {
  ExperimentStatus,
  WinnerSelectionMethod,
} from '../../domain/entities/experiment.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

const TABLE = 'bookagent_experiments';

// ---------------------------------------------------------------------------
// Track Events
// ---------------------------------------------------------------------------

/**
 * Registra um evento de tracking para uma variante do experimento.
 */
export function trackEvent(
  experiment: Experiment,
  payload: TrackEventPayload,
): Experiment {
  const variant = experiment.variants.find((v) => v.variantId === payload.variantId);
  if (!variant) {
    logger.warn(
      `[ExperimentTracker] Variant ${payload.variantId} not found in experiment ${experiment.id}`,
    );
    return experiment;
  }

  const count = payload.count ?? 1;
  const perf = variant.performance;

  switch (payload.eventType) {
    case 'view':
      perf.views += count;
      break;
    case 'click':
      perf.clicks += count;
      break;
    case 'engagement':
      perf.engagement += count;
      break;
  }

  // Recalculate rates
  perf.clickThroughRate = perf.views > 0 ? perf.clicks / perf.views : 0;
  perf.engagementRate = perf.views > 0 ? perf.engagement / perf.views : 0;

  // Recalculate composite score
  perf.compositeScore = calculateCompositeScore(perf, experiment.config.weights);
  perf.lastUpdatedAt = new Date();

  experiment.updatedAt = new Date();

  logger.info(
    `[ExperimentTracker] Tracked ${payload.eventType} for variant ${payload.variantId} ` +
    `in experiment ${experiment.id}: views=${perf.views} clicks=${perf.clicks} ` +
    `engagement=${perf.engagement} composite=${perf.compositeScore.toFixed(2)}`,
  );

  return experiment;
}

// ---------------------------------------------------------------------------
// Winner Selection
// ---------------------------------------------------------------------------

/**
 * Tenta selecionar um vencedor para o experimento.
 * Se condições mínimas não forem atingidas, usa fallback.
 */
export function selectWinner(experiment: Experiment): Experiment {
  if (experiment.status === ExperimentStatus.COMPLETED) {
    return experiment; // Already concluded
  }

  const variants = experiment.variants;
  if (variants.length < 2) {
    logger.warn(`[ExperimentTracker] Experiment ${experiment.id}: < 2 variantes`);
    return experiment;
  }

  // Check if we have real performance data
  const hasRealData = variants.some((v) => v.performance.views > 0);
  const meetsMinViews = variants.every(
    (v) => v.performance.views >= experiment.config.minViewsPerVariant,
  );

  let method: WinnerSelectionMethod;
  let sorted: ExperimentVariant[];

  if (hasRealData && meetsMinViews) {
    // Use real performance data
    method = WinnerSelectionMethod.PERFORMANCE;
    sorted = [...variants].sort(
      (a, b) => b.performance.compositeScore - a.performance.compositeScore,
    );
  } else {
    // Fallback to internal scoring
    method = WinnerSelectionMethod.INTERNAL_SCORE;
    sorted = [...variants].sort(
      (a, b) => b.performance.internalScore - a.performance.internalScore,
    );
  }

  const winner = sorted[0]!;
  const runnerUp = sorted[1]!;

  // Calculate margin
  const winnerScore = method === WinnerSelectionMethod.PERFORMANCE
    ? winner.performance.compositeScore
    : winner.performance.internalScore;
  const runnerUpScore = method === WinnerSelectionMethod.PERFORMANCE
    ? runnerUp.performance.compositeScore
    : runnerUp.performance.internalScore;
  const marginPercent = winnerScore > 0
    ? Math.round(((winnerScore - runnerUpScore) / winnerScore) * 100)
    : 0;

  // Confidence: simple heuristic based on margin and data volume
  let confidence = 0.5; // base
  if (method === WinnerSelectionMethod.PERFORMANCE) {
    const avgViews = variants.reduce((s, v) => s + v.performance.views, 0) / variants.length;
    if (avgViews >= 500) confidence = 0.9;
    else if (avgViews >= 100) confidence = 0.75;
    else confidence = 0.6;
    if (marginPercent < 5) confidence *= 0.7; // Low margin = lower confidence
  }

  // Mark winner
  for (const v of experiment.variants) {
    v.isWinner = v.variantId === winner.variantId;
  }

  const result: ExperimentResult = {
    winnerVariantId: winner.variantId,
    winnerGroup: winner.group,
    method,
    marginPercent,
    confidence: Math.round(confidence * 100) / 100,
    summary: buildSummary(winner, runnerUp, method, marginPercent),
    concludedAt: new Date(),
  };

  experiment.result = result;
  experiment.winnerVariantId = winner.variantId;
  experiment.status = ExperimentStatus.COMPLETED;
  experiment.completedAt = new Date();
  experiment.updatedAt = new Date();

  logger.info(
    `[ExperimentTracker] Experiment ${experiment.id} completed: ` +
    `winner=${winner.variantId} group=${winner.group} ` +
    `method=${method} margin=${marginPercent}% confidence=${confidence}`,
  );

  return experiment;
}

/**
 * Seleção manual do vencedor pelo usuário.
 */
export function selectWinnerManual(
  experiment: Experiment,
  winnerVariantId: string,
): Experiment {
  const winner = experiment.variants.find((v) => v.variantId === winnerVariantId);
  if (!winner) {
    logger.warn(`[ExperimentTracker] Variant ${winnerVariantId} not found`);
    return experiment;
  }

  for (const v of experiment.variants) {
    v.isWinner = v.variantId === winnerVariantId;
  }

  experiment.result = {
    winnerVariantId,
    winnerGroup: winner.group,
    method: WinnerSelectionMethod.MANUAL,
    marginPercent: 0,
    confidence: 1.0,
    summary: `Variante ${winner.group} (${winner.name}) selecionada manualmente.`,
    concludedAt: new Date(),
  };

  experiment.winnerVariantId = winnerVariantId;
  experiment.status = ExperimentStatus.COMPLETED;
  experiment.completedAt = new Date();
  experiment.updatedAt = new Date();

  return experiment;
}

/**
 * Inicia o experimento (muda status para running).
 */
export function startExperiment(experiment: Experiment): Experiment {
  if (experiment.status !== ExperimentStatus.DRAFT) {
    logger.warn(`[ExperimentTracker] Experiment ${experiment.id} is not draft`);
    return experiment;
  }

  experiment.status = ExperimentStatus.RUNNING;
  experiment.updatedAt = new Date();

  logger.info(`[ExperimentTracker] Experiment ${experiment.id} started`);
  return experiment;
}

/**
 * Cancela o experimento.
 */
export function cancelExperiment(experiment: Experiment): Experiment {
  experiment.status = ExperimentStatus.CANCELLED;
  experiment.updatedAt = new Date();

  logger.info(`[ExperimentTracker] Experiment ${experiment.id} cancelled`);
  return experiment;
}

// ---------------------------------------------------------------------------
// Composite Score
// ---------------------------------------------------------------------------

function calculateCompositeScore(
  perf: VariantPerformance,
  weights: ExperimentWeights,
): number {
  // Normalize views to 0-100 scale (cap at 10000 views)
  const normalizedViews = Math.min(perf.views / 100, 100);

  // CTR and engagement rate are already 0-1, scale to 0-100
  const normalizedCtr = perf.clickThroughRate * 100;
  const normalizedEngagement = perf.engagementRate * 100;

  // Internal score is already 0-100
  const internalScore = perf.internalScore;

  return (
    normalizedViews * weights.views +
    normalizedCtr * weights.ctr +
    normalizedEngagement * weights.engagement +
    internalScore * weights.internalScore
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function buildSummary(
  winner: ExperimentVariant,
  runnerUp: ExperimentVariant,
  method: WinnerSelectionMethod,
  marginPercent: number,
): string {
  const methodLabel = method === WinnerSelectionMethod.PERFORMANCE
    ? 'métricas de performance'
    : 'scoring interno';

  return (
    `Variante ${winner.group} (${winner.name}) venceu por ${marginPercent}% de margem ` +
    `sobre variante ${runnerUp.group} (${runnerUp.name}), ` +
    `baseado em ${methodLabel}.`
  );
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

interface ExperimentRow {
  id: string;
  job_id: string;
  name: string;
  status: string;
  variants: string;
  variant_ids: string;
  result: string | null;
  winner_variant_id: string | null;
  config: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/**
 * Persiste um experimento no Supabase.
 */
export async function persistExperiment(
  experiment: Experiment,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  try {
    await supabase.upsert(TABLE, {
      id: experiment.id,
      job_id: experiment.jobId,
      name: experiment.name,
      status: experiment.status,
      variants: JSON.stringify(experiment.variants),
      variant_ids: JSON.stringify(experiment.variantIds),
      result: experiment.result ? JSON.stringify(experiment.result) : null,
      winner_variant_id: experiment.winnerVariantId ?? null,
      config: JSON.stringify(experiment.config),
      created_at: experiment.createdAt.toISOString(),
      updated_at: experiment.updatedAt.toISOString(),
      completed_at: experiment.completedAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.warn(`[ExperimentTracker] Failed to persist experiment ${experiment.id}: ${err}`);
  }
}

/**
 * Carrega um experimento do Supabase.
 */
export async function loadExperiment(
  experimentId: string,
  supabase: SupabaseClient | null,
): Promise<Experiment | null> {
  if (!supabase) return null;

  try {
    const rows = await supabase.select<ExperimentRow>(TABLE, {
      filters: [{ column: 'id', operator: 'eq', value: experimentId }],
      limit: 1,
    });

    return rows.length > 0 ? rowToExperiment(rows[0]) : null;
  } catch (err) {
    logger.warn(`[ExperimentTracker] Failed to load experiment ${experimentId}: ${err}`);
    return null;
  }
}

/**
 * Lista experimentos de um job.
 */
export async function listExperiments(
  jobId: string,
  supabase: SupabaseClient | null,
): Promise<Experiment[]> {
  if (!supabase) return [];

  try {
    const rows = await supabase.select<ExperimentRow>(TABLE, {
      filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
      orderBy: 'created_at',
      orderDesc: true,
    });

    return rows.map(rowToExperiment);
  } catch (err) {
    logger.warn(`[ExperimentTracker] Failed to list experiments for job ${jobId}: ${err}`);
    return [];
  }
}

function rowToExperiment(row: ExperimentRow): Experiment {
  return {
    id: row.id,
    jobId: row.job_id,
    name: row.name,
    status: row.status as ExperimentStatus,
    variants: JSON.parse(row.variants) as ExperimentVariant[],
    variantIds: JSON.parse(row.variant_ids) as string[],
    result: row.result ? JSON.parse(row.result) as ExperimentResult : undefined,
    winnerVariantId: row.winner_variant_id ?? undefined,
    config: JSON.parse(row.config) as Experiment['config'],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  };
}
