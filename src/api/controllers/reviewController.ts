/**
 * Review Controller — Review/Comment Engine
 *
 * Endpoints para criação e consulta de reviews sobre outputs.
 * Suporta reviews por job, artifact ou variante.
 *
 * POST /jobs/:jobId/review     → Criar review (aprovação/reprovação/ajuste/comentário)
 * GET  /jobs/:jobId/reviews    → Listar reviews do job
 * GET  /jobs/:jobId/reviews/summary → Resumo de reviews
 *
 * Parte 68: Review/Comment Engine
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../helpers/response.js';
import {
  createReview,
  listReviews,
  getReviewSummary,
} from '../../modules/review/index.js';
import {
  ReviewDecision,
  ReviewChannel,
  ReviewTargetType,
} from '../../domain/entities/review.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Dependency injection — Supabase client
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForReview(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

// ============================================================================
// Schemas
// ============================================================================

const CreateReviewSchema = z.object({
  userId: z.string().min(1),
  targetType: z.nativeEnum(ReviewTargetType).optional().default(ReviewTargetType.JOB),
  decision: z.nativeEnum(ReviewDecision),
  comment: z.string().min(1),
  channel: z.nativeEnum(ReviewChannel).optional().default(ReviewChannel.DASHBOARD),
  artifactId: z.string().optional(),
  variantId: z.string().optional(),
  approvalRound: z.number().int().positive().optional(),
  parentReviewId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const ListReviewsSchema = z.object({
  artifactId: z.string().optional(),
  variantId: z.string().optional(),
  targetType: z.nativeEnum(ReviewTargetType).optional(),
  decision: z.nativeEnum(ReviewDecision).optional(),
  status: z.enum(['open', 'resolved', 'superseded']).optional(),
  channel: z.nativeEnum(ReviewChannel).optional(),
});

// ============================================================================
// POST /api/v1/jobs/:jobId/review
// ============================================================================

export async function createJobReview(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  const parsed = CreateReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Dados inválidos', 400, parsed.error.flatten());
    return;
  }

  try {
    const review = await createReview(
      { ...parsed.data, jobId },
      supabaseClient,
    );

    logger.info(`[reviewController] Review created: ${review.id} for job ${jobId}`);

    sendSuccess(res, {
      reviewId: review.id,
      jobId: review.jobId,
      targetType: review.targetType,
      decision: review.decision,
      status: review.status,
      message: getDecisionMessage(review.decision),
    }, 201);
  } catch (err) {
    logger.error(`[reviewController] Failed to create review for job ${jobId}: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Falha ao criar review', 500, err);
  }
}

// ============================================================================
// GET /api/v1/jobs/:jobId/reviews
// ============================================================================

export async function getJobReviews(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  const parsed = ListReviewsSchema.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Filtros inválidos', 400, parsed.error.flatten());
    return;
  }

  try {
    const reviews = await listReviews(
      { jobId, ...parsed.data } as Parameters<typeof listReviews>[0],
      supabaseClient,
    );

    sendSuccess(res, {
      jobId,
      reviews,
      total: reviews.length,
    });
  } catch (err) {
    sendError(res, 'DB_ERROR', 'Erro ao buscar reviews', 500, err);
  }
}

// ============================================================================
// GET /api/v1/jobs/:jobId/reviews/summary
// ============================================================================

export async function getJobReviewSummary(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  try {
    const summary = await getReviewSummary(jobId, supabaseClient);
    sendSuccess(res, summary);
  } catch (err) {
    sendError(res, 'DB_ERROR', 'Erro ao gerar resumo de reviews', 500, err);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getDecisionMessage(decision: ReviewDecision): string {
  switch (decision) {
    case ReviewDecision.APPROVED:
      return 'Aprovação registrada.';
    case ReviewDecision.REJECTED:
      return 'Reprovação registrada.';
    case ReviewDecision.ADJUSTMENT_REQUESTED:
      return 'Pedido de ajuste registrado.';
    case ReviewDecision.COMMENT:
      return 'Comentário registrado.';
    default:
      return 'Review registrado.';
  }
}
