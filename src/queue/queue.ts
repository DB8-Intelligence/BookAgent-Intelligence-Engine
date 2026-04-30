/**
 * Queue — Cloud Tasks based async job enqueueing
 *
 * Substitui BullMQ/Redis por Google Cloud Tasks. Fluxo:
 *   1. enqueueJob(data) cria uma task Cloud Tasks
 *   2. Cloud Tasks POST /internal/execute-pipeline com o payload
 *   3. O endpoint (src/api/routes/internal.ts) roda o pipeline inline
 *
 * Modo sync (fallback): se Cloud Tasks não configurado, retorna null e o
 * processController.ts processa inline via handleSyncMode.
 */

import type { BookAgentJobData } from './types.js';
import { isCloudTasksConfigured, enqueuePipelineTask } from './cloud-tasks.js';
import { logger } from '../utils/logger.js';

/**
 * Indica se o modo async (Cloud Tasks) está disponível.
 * Usado por controllers pra decidir entre queue mode e sync mode.
 */
export function isQueueAvailable(): boolean {
  return isCloudTasksConfigured();
}

/** Compat alias — código antigo chamava getQueue() esperando um handle */
export function getQueue(): { available: boolean } | null {
  return isCloudTasksConfigured() ? { available: true } : null;
}

/**
 * Enfileira um job no Cloud Tasks. Retorna o task name.
 * Lança se Cloud Tasks não estiver configurado.
 */
export async function enqueueJob(data: BookAgentJobData): Promise<string> {
  if (!isCloudTasksConfigured()) {
    throw new Error(
      '[Queue] Cloud Tasks not configured — sync mode only. ' +
      'Set CLOUD_TASKS_QUEUE, CLOUD_TASKS_LOCATION, CLOUD_TASKS_SA_EMAIL, CLOUD_TASKS_TARGET_URL.',
    );
  }

  const taskName = await enqueuePipelineTask({
    jobId: data.jobId,
    fileUrl: data.fileUrl,
    type: data.type,
    userContext: data.userContext,
    webhookUrl: data.webhookUrl,
    tenantContext: data.tenantContext,
  });

  logger.info(`[Queue] Pipeline task enqueued: ${data.jobId} (task=${taskName})`);
  return taskName;
}
