/**
 * Video Worker — Dedicated BullMQ Worker for Video Rendering
 *
 * Consumes jobs from the "bookagent-video-render" queue.
 * Separate from the main pipeline worker to allow:
 *   - Different concurrency (1-2 for CPU-heavy video rendering)
 *   - Longer lock duration (video can take several minutes)
 *   - Independent scaling
 *
 * Parte 59.2: Fechamento Operacional do Video Render Async
 */

import { Worker } from 'bullmq';
import type { VideoRenderJobData } from './types.js';
import { createRedisConnection } from './connection.js';
import { processVideoRenderJob, type VideoProcessorDeps } from './video-processor.js';
import { VIDEO_QUEUE_NAME } from './video-queue.js';
import { logger } from '../utils/logger.js';

/**
 * Creates the dedicated video render worker.
 * Returns null if Redis is not configured.
 */
export function createVideoWorker(
  deps: VideoProcessorDeps,
): Worker<VideoRenderJobData> | null {
  const connection = createRedisConnection();
  if (!connection) {
    logger.warn('[VideoWorker] Redis not configured — video worker not started');
    return null;
  }

  // Video rendering is CPU-heavy — low concurrency, long timeout
  const concurrency = parseInt(process.env.VIDEO_CONCURRENCY ?? '1', 10);

  const worker = new Worker<VideoRenderJobData>(
    VIDEO_QUEUE_NAME,
    async (bullJob) => {
      await processVideoRenderJob(bullJob, deps);
    },
    {
      connection,
      concurrency,
      lockDuration: 10 * 60 * 1000, // 10 minutes (video render can be slow)
    },
  );

  // Event handlers
  worker.on('active', (job) => {
    logger.info(`[VideoWorker] Job active: job=${job.data.jobId} artifact=${job.data.artifactId}`);
  });

  worker.on('completed', (job) => {
    logger.info(`[VideoWorker] Job completed: job=${job.data.jobId}`);
  });

  worker.on('failed', (job, err) => {
    const jobId = job?.data?.jobId ?? 'unknown';
    const attempt = job?.attemptsMade ?? 0;
    logger.error(
      `[VideoWorker] Job failed: ${jobId} (attempt ${attempt}): ${err.message}`
    );
  });

  worker.on('stalled', (jobId) => {
    logger.warn(`[VideoWorker] Job stalled: ${jobId}`);
  });

  worker.on('error', (err) => {
    logger.error(`[VideoWorker] Internal error: ${err.message}`);
  });

  logger.info(
    `[VideoWorker] Started — queue="${VIDEO_QUEUE_NAME}", concurrency=${concurrency}`
  );

  return worker;
}
