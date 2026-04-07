/**
 * Revision Controller — Revision Loop Engine
 *
 * Endpoints para criação e consulta de revisões incrementais.
 *
 * POST /jobs/:jobId/revision     → Criar e executar revisão
 * GET  /jobs/:jobId/revisions    → Listar revisões do job
 *
 * Parte 69: Revision Loop Engine
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../helpers/response.js';
import {
  createAndExecuteRevision,
  listRevisions,
  getRevisionById,
} from '../../modules/revision/index.js';
import { resolveReview } from '../../modules/review/index.js';
import { RevisionTargetType } from '../../domain/entities/revision.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Dependency injection — Supabase client
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForRevision(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

// ============================================================================
// Schemas
// ============================================================================

const CreateRevisionSchema = z.object({
  userId: z.string().min(1),
  reviewId: z.string().min(1),
  targetType: z.nativeEnum(RevisionTargetType),
  requestedChange: z.string().min(1),
  artifactId: z.string().optional(),
  variantId: z.string().optional(),
  field: z.string().optional(),
});

// ============================================================================
// POST /api/v1/jobs/:jobId/revision
// ============================================================================

export async function createJobRevision(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  const parsed = CreateRevisionSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Dados inválidos', 400, parsed.error.flatten());
    return;
  }

  try {
    const revision = await createAndExecuteRevision(
      { ...parsed.data, jobId },
      supabaseClient,
    );

    // Link the review to the revision (resolve it)
    await resolveReview(parsed.data.reviewId, revision.id, supabaseClient);

    logger.info(
      `[revisionController] Revision ${revision.id} for job ${jobId}: ` +
      `status=${revision.status} strategy=${revision.strategy}`,
    );

    sendSuccess(res, {
      revisionId: revision.id,
      jobId: revision.jobId,
      reviewId: revision.reviewId,
      strategy: revision.strategy,
      status: revision.status,
      version: revision.version,
      result: revision.result,
      message: revision.status === 'completed'
        ? 'Revisão executada com sucesso.'
        : `Revisão ${revision.status}.`,
    }, revision.status === 'completed' ? 200 : 202);
  } catch (err) {
    logger.error(`[revisionController] Failed to create revision for job ${jobId}: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Falha ao criar revisão', 500, err);
  }
}

// ============================================================================
// GET /api/v1/jobs/:jobId/revisions
// ============================================================================

export async function getJobRevisions(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  try {
    const revisions = await listRevisions(jobId, supabaseClient);

    sendSuccess(res, {
      jobId,
      revisions,
      total: revisions.length,
    });
  } catch (err) {
    sendError(res, 'DB_ERROR', 'Erro ao buscar revisões', 500, err);
  }
}

// ============================================================================
// GET /api/v1/jobs/:jobId/revisions/:revisionId
// ============================================================================

export async function getJobRevisionById(req: Request, res: Response): Promise<void> {
  const { revisionId } = req.params;

  try {
    const revision = await getRevisionById(revisionId, supabaseClient);

    if (!revision) {
      sendError(res, 'NOT_FOUND', 'Revisão não encontrada', 404);
      return;
    }

    sendSuccess(res, revision);
  } catch (err) {
    sendError(res, 'DB_ERROR', 'Erro ao buscar revisão', 500, err);
  }
}
