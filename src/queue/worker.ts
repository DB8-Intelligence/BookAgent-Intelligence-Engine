/**
 * Worker Factory — Criação do Worker BullMQ
 *
 * Cria e configura o Worker que consome a fila "bookagent-processing".
 * O Worker usa uma conexão IORedis SEPARADA da Queue (exigência BullMQ).
 *
 * Configuração:
 *   QUEUE_CONCURRENCY — número de jobs processados em paralelo (default: 2)
 *
 * Uso:
 *   const worker = createWorker(deps);
 *   // worker roda em background, chamando processBookAgentJob para cada job
 */

import { Worker } from 'bullmq';
import type { BookAgentJobData } from './types.js';
import { createRedisConnection } from './connection.js';
import { processBookAgentJob, type ProcessorDependencies } from './job-processor.js';
import { QUEUE_NAME } from './queue.js';
import { logger } from '../utils/logger.js';

/**
 * Cria o Worker BullMQ com os deps fornecidos.
 * Retorna null se Redis não estiver configurado.
 */
export function createWorker(
  deps: ProcessorDependencies,
): Worker<BookAgentJobData> | null {
  // Worker precisa de conexão própria (separada da Queue)
  const connection = createRedisConnection();
  if (!connection) {
    logger.warn('[Worker] Redis not configured — worker not started');
    return null;
  }

  const concurrency = parseInt(process.env.QUEUE_CONCURRENCY ?? '2', 10);

  const worker = new Worker<BookAgentJobData>(
    QUEUE_NAME,
    async (bullJob) => {
      await processBookAgentJob(bullJob, deps);
    },
    {
      connection,
      concurrency,
      // Tempo máximo por job: 30 minutos (pipeline pode demorar)
      lockDuration: 30 * 60 * 1000,
    },
  );

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  worker.on('active', (job) => {
    logger.info(`[Worker] Job active: ${job.data.jobId} (BullMQ id=${job.id})`);
  });

  worker.on('completed', (job) => {
    logger.info(`[Worker] Job completed: ${job.data.jobId} (BullMQ id=${job.id})`);
  });

  worker.on('failed', (job, err) => {
    const jobId    = job?.data?.jobId ?? 'unknown';
    const attempt  = job?.attemptsMade ?? 0;
    const maxRetry = job?.opts?.attempts ?? 3;
    logger.error(
      `[Worker] Job failed: ${jobId} ` +
      `(attempt ${attempt}/${maxRetry}): ${err.message}`,
    );
  });

  worker.on('stalled', (jobId) => {
    logger.warn(`[Worker] Job stalled (will retry): ${jobId}`);
  });

  worker.on('error', (err) => {
    logger.error(`[Worker] Internal error: ${err.message}`);
  });

  logger.info(
    `[Worker] Started — queue="${QUEUE_NAME}", concurrency=${concurrency}`,
  );

  return worker;
}
