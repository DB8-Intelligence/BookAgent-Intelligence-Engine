/**
 * Queue Health — BookAgent Intelligence Engine
 *
 * Introspects BullMQ queue to provide real-time health metrics.
 * Used by the ops dashboard to monitor queue depth, capacity, and bottlenecks.
 *
 * Parte 57: Estratégia de Crescimento Escalável
 */

import { getQueue } from '../queue/queue.js';
import { logger } from '../utils/logger.js';

export interface QueueHealthSnapshot {
  available: boolean;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
  /** Percentage of capacity used (active / concurrency) */
  capacityUsedPct: number;
  /** True if waiting > active * 2 — sign of congestion */
  congested: boolean;
}

const FALLBACK: QueueHealthSnapshot = {
  available: false,
  waiting: 0,
  active: 0,
  completed: 0,
  failed: 0,
  delayed: 0,
  total: 0,
  capacityUsedPct: 0,
  congested: false,
};

/**
 * Returns a point-in-time snapshot of the BullMQ queue health.
 * Returns a zeroed snapshot if Redis/queue is not available.
 */
export async function getQueueHealth(): Promise<QueueHealthSnapshot> {
  const queue = getQueue();
  if (!queue) return FALLBACK;

  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    const concurrency = parseInt(process.env.QUEUE_CONCURRENCY ?? '2', 10);
    const capacityUsedPct = concurrency > 0
      ? Math.round((active / concurrency) * 100)
      : 0;

    return {
      available: true,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
      capacityUsedPct,
      congested: waiting > active * 2 && waiting > 5,
    };
  } catch (err) {
    logger.warn(`[QueueHealth] Failed to read queue stats: ${err}`);
    return FALLBACK;
  }
}
