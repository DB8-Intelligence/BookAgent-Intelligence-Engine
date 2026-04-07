/**
 * Experiment Controller — A/B Testing Engine
 *
 * Endpoints para criação, tracking e consulta de experimentos.
 *
 * POST /experiments              → Criar experimento
 * GET  /experiments/:id          → Detalhe do experimento
 * POST /experiments/:id/start    → Iniciar experimento
 * POST /experiments/:id/track    → Registrar evento (view/click/engagement)
 * POST /experiments/:id/complete → Selecionar vencedor (auto ou manual)
 * GET  /jobs/:jobId/experiments  → Listar experimentos de um job
 *
 * Parte 72: A/B Testing Engine
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../helpers/response.js';
import {
  buildExperiment,
  trackEvent,
  selectWinner,
  selectWinnerManual,
  startExperiment,
  persistExperiment,
  loadExperiment,
  listExperiments,
} from '../../modules/experiments/index.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Dependency injection — Supabase client
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForExperiments(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

// ============================================================================
// Schemas
// ============================================================================

const CreateExperimentSchema = z.object({
  jobId: z.string().min(1),
  name: z.string().optional(),
  variantIds: z.array(z.string().min(1)).min(2),
  config: z.object({
    minDurationHours: z.number().positive().optional(),
    minViewsPerVariant: z.number().nonnegative().optional(),
    autoComplete: z.boolean().optional(),
    weights: z.object({
      views: z.number().min(0).max(1).optional(),
      ctr: z.number().min(0).max(1).optional(),
      engagement: z.number().min(0).max(1).optional(),
      internalScore: z.number().min(0).max(1).optional(),
    }).optional(),
  }).optional(),
});

const TrackEventSchema = z.object({
  variantId: z.string().min(1),
  eventType: z.enum(['view', 'click', 'engagement']),
  count: z.number().positive().optional(),
});

const CompleteExperimentSchema = z.object({
  winnerVariantId: z.string().optional(),
});

// ============================================================================
// POST /api/v1/experiments
// ============================================================================

export async function createExperiment(req: Request, res: Response): Promise<void> {
  const parsed = CreateExperimentSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Dados inválidos', 400, parsed.error.flatten());
    return;
  }

  try {
    const experiment = buildExperiment(parsed.data);
    await persistExperiment(experiment, supabaseClient);

    logger.info(`[experimentController] Created experiment ${experiment.id}`);

    sendSuccess(res, {
      experimentId: experiment.id,
      jobId: experiment.jobId,
      status: experiment.status,
      variants: experiment.variants.map((v) => ({
        variantId: v.variantId,
        group: v.group,
        name: v.name,
      })),
      message: 'Experimento criado. Use POST /start para iniciar.',
    }, 201);
  } catch (err) {
    logger.error(`[experimentController] Failed to create experiment: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Falha ao criar experimento', 500, err);
  }
}

// ============================================================================
// GET /api/v1/experiments/:experimentId
// ============================================================================

export async function getExperiment(req: Request, res: Response): Promise<void> {
  const { experimentId } = req.params;

  try {
    const experiment = await loadExperiment(experimentId, supabaseClient);

    if (!experiment) {
      sendError(res, 'NOT_FOUND', 'Experimento não encontrado', 404);
      return;
    }

    sendSuccess(res, experiment);
  } catch (err) {
    sendError(res, 'DB_ERROR', 'Erro ao buscar experimento', 500, err);
  }
}

// ============================================================================
// POST /api/v1/experiments/:experimentId/start
// ============================================================================

export async function startExperimentEndpoint(req: Request, res: Response): Promise<void> {
  const { experimentId } = req.params;

  try {
    let experiment = await loadExperiment(experimentId, supabaseClient);
    if (!experiment) {
      sendError(res, 'NOT_FOUND', 'Experimento não encontrado', 404);
      return;
    }

    experiment = startExperiment(experiment);
    await persistExperiment(experiment, supabaseClient);

    sendSuccess(res, {
      experimentId: experiment.id,
      status: experiment.status,
      message: 'Experimento iniciado.',
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao iniciar experimento', 500, err);
  }
}

// ============================================================================
// POST /api/v1/experiments/:experimentId/track
// ============================================================================

export async function trackExperimentEvent(req: Request, res: Response): Promise<void> {
  const { experimentId } = req.params;

  const parsed = TrackEventSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Dados inválidos', 400, parsed.error.flatten());
    return;
  }

  try {
    let experiment = await loadExperiment(experimentId, supabaseClient);
    if (!experiment) {
      sendError(res, 'NOT_FOUND', 'Experimento não encontrado', 404);
      return;
    }

    experiment = trackEvent(experiment, {
      experimentId,
      ...parsed.data,
    });

    await persistExperiment(experiment, supabaseClient);

    const variant = experiment.variants.find((v) => v.variantId === parsed.data.variantId);
    sendSuccess(res, {
      experimentId,
      variantId: parsed.data.variantId,
      eventType: parsed.data.eventType,
      performance: variant?.performance,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao registrar evento', 500, err);
  }
}

// ============================================================================
// POST /api/v1/experiments/:experimentId/complete
// ============================================================================

export async function completeExperiment(req: Request, res: Response): Promise<void> {
  const { experimentId } = req.params;

  const parsed = CompleteExperimentSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Dados inválidos', 400, parsed.error.flatten());
    return;
  }

  try {
    let experiment = await loadExperiment(experimentId, supabaseClient);
    if (!experiment) {
      sendError(res, 'NOT_FOUND', 'Experimento não encontrado', 404);
      return;
    }

    if (parsed.data.winnerVariantId) {
      experiment = selectWinnerManual(experiment, parsed.data.winnerVariantId);
    } else {
      experiment = selectWinner(experiment);
    }

    await persistExperiment(experiment, supabaseClient);

    sendSuccess(res, {
      experimentId: experiment.id,
      status: experiment.status,
      result: experiment.result,
      message: experiment.result
        ? `Vencedor: variante ${experiment.result.winnerGroup} (${experiment.result.method})`
        : 'Experimento concluído sem resultado.',
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao concluir experimento', 500, err);
  }
}

// ============================================================================
// GET /api/v1/jobs/:jobId/experiments
// ============================================================================

export async function getJobExperiments(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  try {
    const experiments = await listExperiments(jobId, supabaseClient);

    sendSuccess(res, {
      jobId,
      experiments,
      total: experiments.length,
    });
  } catch (err) {
    sendError(res, 'DB_ERROR', 'Erro ao buscar experimentos', 500, err);
  }
}
