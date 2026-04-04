/**
 * Queue — Instância da fila BullMQ
 *
 * Fila: "bookagent-processing"
 * Retry: 3 tentativas com backoff exponencial (5s, 10s, 20s)
 *
 * A fila usa uma conexão IORedis separada da do Worker (exigência BullMQ).
 *
 * Retorna null se Redis não estiver configurado → modo síncrono.
 */

import { Queue } from 'bullmq';
import type { BookAgentJobData } from './types.js';
import { getSharedConnection } from './connection.js';
import { logger } from '../utils/logger.js';

export const QUEUE_NAME = 'bookagent-processing';

let queueInstance: Queue<BookAgentJobData> | null = null;

/**
 * Retorna a instância da fila (lazy singleton).
 * Null se Redis não estiver configurado.
 */
export function getQueue(): Queue<BookAgentJobData> | null {
  if (queueInstance) return queueInstance;

  const connection = getSharedConnection();
  if (!connection) return null;

  queueInstance = new Queue<BookAgentJobData>(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s, 10s, 20s
      },
      removeOnComplete: { count: 100 }, // manter últimos 100 concluídos
      removeOnFail:     { count: 200 }, // manter últimos 200 com falha
    },
  });

  queueInstance.on('error', (err) => {
    logger.error(`[Queue] Error: ${err.message}`);
  });

  logger.info(`[Queue] Initialized — name="${QUEUE_NAME}"`);
  return queueInstance;
}

/**
 * Adiciona um job à fila com um ID customizado (o jobId da API).
 * Usar jobId customizado permite rastrear pela mesma chave em todo o sistema.
 */
export async function enqueueJob(data: BookAgentJobData): Promise<string> {
  const queue = getQueue();
  if (!queue) {
    throw new Error('[Queue] Redis not configured — cannot enqueue job');
  }

  const job = await queue.add('process', data, {
    jobId: data.jobId,
  });

  logger.info(`[Queue] Job enqueued: ${data.jobId} (type=${data.type})`);
  return job.id ?? data.jobId;
}
