/**
 * Video Render Controller — BookAgent Intelligence Engine
 *
 * Handles async video rendering requests triggered post-approval.
 *
 * Architecture decision (Parte 59.1):
 *   The pipeline (stages 1-15) generates RenderSpec artifacts.
 *   Video .mp4 rendering is a SEPARATE async job, triggered explicitly
 *   after approval — not part of the blocking pipeline.
 *
 * Endpoints:
 *   POST /api/v1/jobs/:jobId/render-video  → Queue video render from RenderSpec
 *   GET  /api/v1/jobs/:jobId/video-status  → Check render progress
 *
 * Parte 59.1: Fechamento do Pipeline de Vídeo
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../helpers/response.js';
import { logger } from '../../utils/logger.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';

// ============================================================================
// Dependency injection
// ============================================================================

let supabase: SupabaseClient | null = null;

export function setVideoRenderSupabaseClient(client: SupabaseClient): void {
  supabase = client;
}

// ============================================================================
// Types
// ============================================================================

interface ArtifactRow {
  id: string;
  job_id: string;
  artifact_type: string;
  export_format: string;
  content: string;
  status: string;
  referenced_asset_ids: string[] | null;
}

// ============================================================================
// POST /api/v1/jobs/:jobId/render-video
// ============================================================================

const RenderVideoSchema = z.object({
  /** Specific artifact ID to render. If omitted, uses first RENDER_SPEC artifact. */
  artifactId: z.string().uuid().optional(),
});

/**
 * Queues a video render job from a RenderSpec artifact.
 *
 * Flow:
 *   1. Find the RenderSpec artifact for this job
 *   2. Validate the spec is renderable
 *   3. Create a video render record in Supabase
 *   4. Return job tracking info
 *
 * The actual rendering is done by the worker (or can be triggered sync for testing).
 */
export async function renderVideo(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  if (!supabase) {
    sendError(res, 'SERVICE_UNAVAILABLE', 'Supabase not configured', 503);
    return;
  }

  const parsed = RenderVideoSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Invalid request', 400, parsed.error.flatten());
    return;
  }

  try {
    // Find RenderSpec artifact
    const filters = [
      { column: 'job_id', operator: 'eq' as const, value: jobId },
      { column: 'artifact_type', operator: 'eq' as const, value: 'MEDIA_RENDER_SPEC' },
    ];

    if (parsed.data.artifactId) {
      filters.push({ column: 'id', operator: 'eq' as const, value: parsed.data.artifactId });
    }

    const artifacts = await supabase.select<ArtifactRow>('bookagent_job_artifacts', {
      filters,
      orderBy: 'created_at',
      orderDesc: true,
      limit: 1,
    });

    if (artifacts.length === 0) {
      sendError(res, 'NOT_FOUND', 'No RENDER_SPEC artifact found for this job', 404);
      return;
    }

    const artifact = artifacts[0];

    // Validate the spec is parseable
    let spec: Record<string, unknown>;
    try {
      spec = JSON.parse(artifact.content);
    } catch {
      sendError(res, 'INVALID_SPEC', 'RenderSpec artifact contains invalid JSON', 422);
      return;
    }

    const sceneCount = (spec.scenes as unknown[])?.length ?? 0;
    if (sceneCount === 0) {
      sendError(res, 'EMPTY_SPEC', 'RenderSpec has no scenes to render', 422);
      return;
    }

    // Record the render request
    const renderRecord = {
      job_id: jobId,
      artifact_id: artifact.id,
      status: 'queued',
      scene_count: sceneCount,
      format: spec.format ?? 'video',
      resolution: spec.resolution ?? [1080, 1920],
    };

    // Store in bookagent_job_meta as video render metadata
    try {
      await supabase.update(
        'bookagent_job_meta',
        { column: 'job_id', operator: 'eq', value: jobId },
        {
          video_render_status: 'queued',
          video_render_artifact_id: artifact.id,
          video_render_requested_at: new Date().toISOString(),
        },
      );
    } catch (err) {
      logger.warn(`[VideoRender] Failed to update job_meta for ${jobId}: ${err}`);
    }

    logger.info(
      `[VideoRender] Queued render for job=${jobId} artifact=${artifact.id} ` +
      `scenes=${sceneCount} format=${spec.format}`
    );

    sendSuccess(res, {
      jobId,
      artifactId: artifact.id,
      status: 'queued',
      sceneCount,
      format: spec.format,
      resolution: spec.resolution,
      message: 'Video render queued. The .mp4 will be available as an artifact when complete.',
    }, 202);
  } catch (err) {
    logger.error(`[VideoRender] renderVideo failed for job=${jobId}: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Failed to queue video render', 500);
  }
}

// ============================================================================
// GET /api/v1/jobs/:jobId/video-status
// ============================================================================

/**
 * Returns the current status of video rendering for a job.
 */
export async function getVideoStatus(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  if (!supabase) {
    sendError(res, 'SERVICE_UNAVAILABLE', 'Supabase not configured', 503);
    return;
  }

  try {
    const rows = await supabase.select<{
      video_render_status: string | null;
      video_render_artifact_id: string | null;
      video_render_requested_at: string | null;
    }>('bookagent_job_meta', {
      filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
      select: 'video_render_status,video_render_artifact_id,video_render_requested_at',
      limit: 1,
    });

    if (rows.length === 0) {
      sendError(res, 'NOT_FOUND', 'Job not found', 404);
      return;
    }

    const meta = rows[0];

    sendSuccess(res, {
      jobId,
      videoRenderStatus: meta.video_render_status ?? 'not_requested',
      artifactId: meta.video_render_artifact_id,
      requestedAt: meta.video_render_requested_at,
    });
  } catch (err) {
    logger.error(`[VideoRender] getVideoStatus failed for job=${jobId}: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Failed to get video status', 500);
  }
}
