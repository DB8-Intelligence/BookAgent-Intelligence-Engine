/**
 * Video Render Queue — Cloud Tasks based
 *
 * Substitui BullMQ. Enfileira video renders como tasks Cloud Tasks
 * que fazem POST /internal/execute-video-render.
 *
 * Sync fallback: se Cloud Tasks não configurado, caller faz render inline.
 */

import type { VideoRenderJobData } from './types.js';
import { isCloudTasksConfigured, enqueueVideoRenderTask } from './cloud-tasks.js';
import { logger } from '../utils/logger.js';

/**
 * Enfileira uma renderização de vídeo via Cloud Tasks.
 * Lança se Cloud Tasks não estiver configurado (caller deve cair em sync).
 */
export async function enqueueVideoRender(data: VideoRenderJobData): Promise<string> {
  if (!isCloudTasksConfigured()) {
    throw new Error(
      '[VideoQueue] Cloud Tasks not configured — sync render only. ' +
      'Caller must handle inline fallback.',
    );
  }

  const taskName = await enqueueVideoRenderTask({
    jobId: data.jobId,
    artifactId: data.artifactId,
    renderSpecJson: data.renderSpecJson,
    assetUrls: data.assetUrls,
  });

  logger.info(
    `[VideoQueue] Render task enqueued: job=${data.jobId} artifact=${data.artifactId}`,
  );
  return taskName;
}
