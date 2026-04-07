/**
 * Experiment Builder — A/B Testing Engine
 *
 * Cria experimentos agrupando variantes em grupos A/B/C.
 * Conecta com o Variant Engine (Parte 65) e Content Scoring (Parte 70).
 *
 * Estratégia de agrupamento:
 *   - 2 variantes → A/B
 *   - 3 variantes → A/B/C
 *   - 4+ variantes → A/B/C/D (máx 4 grupos)
 *   - Variantes agrupadas por canal ou por prioridade
 *
 * Parte 72: A/B Testing Engine
 */

import { v4 as uuid } from 'uuid';

import type {
  Experiment,
  ExperimentVariant,
  ExperimentConfig,
  CreateExperimentPayload,
} from '../../domain/entities/experiment.js';
import {
  ExperimentStatus,
  DEFAULT_EXPERIMENT_CONFIG,
  EMPTY_PERFORMANCE,
} from '../../domain/entities/experiment.js';
import type { ContentScore } from '../../domain/entities/content-score.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

const GROUPS: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];

// ---------------------------------------------------------------------------
// Build Experiment
// ---------------------------------------------------------------------------

/**
 * Cria um experimento a partir de uma lista de variant IDs.
 * Atribui cada variante a um grupo (A/B/C/D).
 *
 * @param payload - dados para criação
 * @param scores - scores internos (Parte 70) para fallback
 */
export function buildExperiment(
  payload: CreateExperimentPayload,
  scores?: ContentScore[],
): Experiment {
  const now = new Date();

  const config: ExperimentConfig = {
    ...DEFAULT_EXPERIMENT_CONFIG,
    ...payload.config,
    weights: {
      ...DEFAULT_EXPERIMENT_CONFIG.weights,
      ...payload.config?.weights,
    },
  };

  // Map variant IDs to ExperimentVariant with group assignment
  const variants = assignGroups(payload.variantIds, scores);

  const experiment: Experiment = {
    id: uuid(),
    jobId: payload.jobId,
    name: payload.name ?? `Experiment ${payload.jobId.substring(0, 8)}`,
    status: ExperimentStatus.DRAFT,
    variants,
    variantIds: payload.variantIds,
    config,
    createdAt: now,
    updatedAt: now,
  };

  logger.info(
    `[ExperimentBuilder] Created experiment ${experiment.id}: ` +
    `job=${experiment.jobId} variants=${variants.length} ` +
    `groups=[${[...new Set(variants.map((v) => v.group))].join(',')}]`,
  );

  return experiment;
}

/**
 * Cria automaticamente um experimento a partir de todas as variantes de um job.
 * Agrupa por canal de distribuição quando possível.
 */
export function buildExperimentFromJob(
  jobId: string,
  variantIds: string[],
  scores?: ContentScore[],
): Experiment | null {
  if (variantIds.length < 2) {
    logger.info(`[ExperimentBuilder] Job ${jobId}: < 2 variantes, sem experimento`);
    return null;
  }

  return buildExperiment(
    { jobId, variantIds, name: `Auto A/B — ${jobId.substring(0, 8)}` },
    scores,
  );
}

// ---------------------------------------------------------------------------
// Group Assignment
// ---------------------------------------------------------------------------

/**
 * Atribui variantes a grupos A/B/C/D.
 * Distribuição round-robin, máximo 4 grupos.
 */
function assignGroups(
  variantIds: string[],
  scores?: ContentScore[],
): ExperimentVariant[] {
  const scoreMap = new Map<string, number>();
  if (scores) {
    for (const s of scores) {
      scoreMap.set(s.targetId, s.score);
    }
  }

  const maxGroups = Math.min(variantIds.length, GROUPS.length);

  return variantIds.map((variantId, index) => {
    const group = GROUPS[index % maxGroups]!;
    const internalScore = scoreMap.get(variantId) ?? 0;

    return {
      variantId,
      group,
      name: `Variante ${group}${maxGroups > GROUPS.length ? index + 1 : ''}`,
      performance: {
        ...EMPTY_PERFORMANCE,
        internalScore,
        compositeScore: internalScore, // initial composite = internal score
        lastUpdatedAt: new Date(),
      },
      isWinner: false,
    };
  });
}
