/**
 * Video Render Processor — Job Processing Logic
 *
 * Processes video render jobs from the dedicated video queue.
 *
 * Flow:
 *   1. Parse RenderSpec from job payload
 *   2. Download/resolve asset files
 *   3. Call renderFromSpec() → .mp4
 *   4. Persist .mp4 as artifact in Supabase
 *   5. Update video_render_status
 *   6. Send webhook notification
 *
 * Parte 59.2: Fechamento Operacional do Video Render Async
 */

import type { Job as BullJob } from 'bullmq';
import type { VideoRenderJobData, WebhookPayload } from './types.js';
import type { SupabaseClient } from '../persistence/supabase-client.js';
import type { RenderSpec } from '../types/render-spec.js';
import { renderFromSpec } from '../renderers/video/spec-renderer.js';
import { logger } from '../utils/logger.js';
import { metrics } from '../observability/metrics.js';
import { join } from 'node:path';
import { v4 as uuid } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export interface VideoProcessorDeps {
  supabase: SupabaseClient | null;
  outputDir: string;
  tempDir: string;
}

// ============================================================================
// Processor
// ============================================================================

/**
 * Processes a single video render job from BullMQ.
 */
export async function processVideoRenderJob(
  bullJob: BullJob<VideoRenderJobData>,
  deps: VideoProcessorDeps,
): Promise<void> {
  const { jobId, artifactId, renderSpecJson, assetUrls, webhookUrl } = bullJob.data;
  const attempt = bullJob.attemptsMade + 1;
  const startTime = Date.now();

  logger.info(
    `[VideoProcessor] Starting render: job=${jobId} artifact=${artifactId} attempt=${attempt}`
  );

  // Update status to processing
  await updateVideoStatus(deps.supabase, jobId, 'processing');

  try {
    // 1. Parse RenderSpec
    let spec: RenderSpec;
    try {
      spec = JSON.parse(renderSpecJson) as RenderSpec;
    } catch {
      throw new Error('Invalid RenderSpec JSON — cannot parse');
    }

    if (!spec.scenes || spec.scenes.length === 0) {
      throw new Error('RenderSpec has no scenes');
    }

    // 2. Resolve assets — build assetMap from URLs
    // In V1, assets are already on disk (referenced by path in assetUrls)
    // In production, this would download from Supabase Storage
    const assetMap = new Map<string, string>();
    for (const [assetId, path] of Object.entries(assetUrls)) {
      assetMap.set(assetId, path);
    }

    logger.info(
      `[VideoProcessor] Rendering ${spec.scenes.length} scenes, ` +
      `${assetMap.size} assets, format=${spec.format}`
    );

    // 3. Render video
    const jobOutputDir = join(deps.outputDir, jobId);
    const jobTempDir = join(deps.tempDir, `video-${jobId}-${Date.now()}`);

    const result = await renderFromSpec(spec, {
      outputDir: jobOutputDir,
      tempDir: jobTempDir,
      assetMap,
      globalTimeoutMs: 5 * 60_000,
      sceneTimeoutMs: 60_000,
    });

    const durationMs = Date.now() - startTime;

    // 4. Persist .mp4 as artifact
    if (deps.supabase) {
      const artifactRow = {
        id: uuid(),
        job_id: jobId,
        artifact_type: 'VIDEO_RENDER',
        export_format: 'MP4',
        output_format: spec.format,
        title: `Video: ${spec.format} (${result.resolution[0]}x${result.resolution[1]})`,
        file_path: result.outputPath,
        size_bytes: result.sizeBytes,
        status: result.warnings.length > 0 ? 'PARTIAL' : 'VALID',
        warnings: result.warnings,
        referenced_asset_ids: Array.from(assetMap.keys()),
        created_at: new Date().toISOString(),
      };

      try {
        await deps.supabase.insert('bookagent_job_artifacts', artifactRow);
      } catch (err) {
        logger.warn(`[VideoProcessor] Failed to persist video artifact: ${err}`);
      }
    }

    // 5. Update status to completed
    await updateVideoStatus(deps.supabase, jobId, 'completed', {
      video_render_completed_at: new Date().toISOString(),
      video_render_output_path: result.outputPath,
      video_render_size_bytes: result.sizeBytes,
      video_render_duration_seconds: result.durationSeconds,
      video_render_scene_count: result.sceneCount,
    });

    // 6. Track metrics
    metrics.track('job_completed', {
      userId: 'system',
      planTier: 'basic',
      jobId,
      durationMs,
      metadata: { type: 'video_render', scenes: result.sceneCount },
    });

    logger.info(
      `[VideoProcessor] Completed: job=${jobId} ` +
      `${result.filename} (${(result.sizeBytes / 1024).toFixed(1)}KB, ` +
      `${result.durationSeconds.toFixed(1)}s video, rendered in ${(durationMs / 1000).toFixed(1)}s)`
    );

    // 7. Webhook
    if (webhookUrl) {
      await sendWebhook(webhookUrl, {
        source: 'bookagent',
        timestamp: new Date().toISOString(),
        jobId,
        status: 'completed',
        artifacts_count: 1,
        duration_ms: durationMs,
      });
    }
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);

    logger.error(
      `[VideoProcessor] Failed: job=${jobId} attempt=${attempt} ` +
      `after ${(durationMs / 1000).toFixed(1)}s: ${message}`
    );

    // Track failure metric
    metrics.track('job_failed', {
      userId: 'system',
      planTier: 'basic',
      jobId,
      errorCode: 'VIDEO_RENDER_FAILED',
      metadata: { attempt, message },
    });

    // Mark as failed on last attempt
    const maxAttempts = bullJob.opts.attempts ?? 2;
    if (attempt >= maxAttempts) {
      await updateVideoStatus(deps.supabase, jobId, 'failed', {
        video_render_error: message,
      });

      if (webhookUrl) {
        await sendWebhook(webhookUrl, {
          source: 'bookagent',
          timestamp: new Date().toISOString(),
          jobId,
          status: 'failed',
          error: message,
        });
      }
    }

    throw err; // Re-throw for BullMQ retry
  }
}

// ============================================================================
// Helpers
// ============================================================================

async function updateVideoStatus(
  supabase: SupabaseClient | null,
  jobId: string,
  status: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.update(
      'bookagent_job_meta',
      { column: 'job_id', operator: 'eq', value: jobId },
      { video_render_status: status, ...extra },
    );
  } catch (err) {
    logger.warn(`[VideoProcessor] Failed to update video status for ${jobId}: ${err}`);
  }
}

async function sendWebhook(url: string, payload: WebhookPayload): Promise<void> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      logger.info(`[VideoProcessor] Webhook delivered → ${url}`);
    } else {
      logger.warn(`[VideoProcessor] Webhook returned ${response.status} → ${url}`);
    }
  } catch (err) {
    logger.warn(`[VideoProcessor] Webhook failed → ${url}: ${err}`);
  }
}
