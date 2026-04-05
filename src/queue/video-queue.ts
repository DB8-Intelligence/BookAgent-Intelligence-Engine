/**
 * Video Render Queue — Dedicated BullMQ Queue
 *
 * Separate from the main pipeline queue to avoid:
 *   - Video renders blocking document processing
 *   - Different concurrency/timeout requirements
 *   - Different retry strategies (video is CPU-heavy, needs longer timeouts)
 *
 * Queue name: bookagent-video-render
 *
 * Parte 59.2: Fechamento Operacional do Video Render Async
 */

import { Queue } from 'bullmq';
import type { VideoRenderJobData } from './types.js';
import { getSharedConnection } from './connection.js';
import { logger } from '../utils/logger.js';

export const VIDEO_QUEUE_NAME = 'bookagent-video-render';

let videoQueueInstance: Queue<VideoRenderJobData> | null = null;

/**
 * Returns the video render queue (lazy singleton).
 * Null if Redis is not configured.
 */
export function getVideoQueue(): Queue<VideoRenderJobData> | null {
  if (videoQueueInstance) return videoQueueInstance;

  const connection = getSharedConnection();
  if (!connection) return null;

  videoQueueInstance = new Queue<VideoRenderJobData>(VIDEO_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 10_000, // 10s, 20s (video render is slow, give more time between retries)
      },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  });

  videoQueueInstance.on('error', (err) => {
    logger.error(`[VideoQueue] Error: ${err.message}`);
  });

  logger.info(`[VideoQueue] Initialized — name="${VIDEO_QUEUE_NAME}"`);
  return videoQueueInstance;
}

/**
 * Enqueues a video render job.
 * Returns the BullMQ job ID.
 */
export async function enqueueVideoRender(data: VideoRenderJobData): Promise<string> {
  const queue = getVideoQueue();
  if (!queue) {
    throw new Error('[VideoQueue] Redis not configured — cannot enqueue video render');
  }

  const job = await queue.add('video-render', data, {
    jobId: `video-${data.jobId}-${data.artifactId}`,
  });

  logger.info(
    `[VideoQueue] Enqueued video render: job=${data.jobId} artifact=${data.artifactId}`
  );
  return job.id ?? data.jobId;
}
