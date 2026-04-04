/**
 * Job Processor — Lógica central de processamento de jobs
 *
 * Chamado pelo Worker para cada job retirado da fila.
 * Responsável por:
 *   1. Registrar job no Supabase (status=pending)
 *   2. Marcar como processing
 *   3. Executar o pipeline via Orchestrator
 *   4. Persistir resultado (Supabase + disco)
 *   5. Enviar webhook de conclusão (se configurado)
 *   6. Em erro: marcar como failed + retry (BullMQ cuida dos retries)
 *
 * Operações de persistência são best-effort: falhas são logadas
 * mas não interrompem a execução do pipeline.
 */

import type { Job as BullJob } from 'bullmq';
import type { BookAgentJobData, WebhookPayload } from './types.js';
import type { Orchestrator } from '../core/orchestrator.js';
import type { JobRepository } from '../persistence/job-repository.js';
import type { ArtifactRepository } from '../persistence/artifact-repository.js';
import type { StorageManager } from '../persistence/storage-manager.js';
import { InputType, JobStatus } from '../domain/value-objects/index.js';
import type { Job, JobInput } from '../domain/entities/job.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessorDependencies {
  orchestrator: Orchestrator;
  jobRepo: JobRepository | null;
  artifactRepo: ArtifactRepository | null;
  storageManager: StorageManager | null;
}

const INPUT_TYPE_MAP: Record<string, InputType> = {
  pdf:      InputType.PDF,
  video:    InputType.VIDEO,
  audio:    InputType.AUDIO,
  pptx:     InputType.PPTX,
  document: InputType.DOCUMENT,
};

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

/**
 * Processa um job BullMQ completo: pipeline + persistência + webhook.
 * Lança erro em falhas de pipeline (BullMQ vai re-enfileirar).
 * Falhas de persistência são silenciosas (best-effort).
 */
export async function processBookAgentJob(
  bullJob: BullJob<BookAgentJobData>,
  deps: ProcessorDependencies,
): Promise<void> {
  const { jobId, fileUrl, type, userContext, webhookUrl } = bullJob.data;
  const { orchestrator, jobRepo, artifactRepo, storageManager } = deps;
  const attempt = bullJob.attemptsMade + 1;

  logger.info(
    `[JobProcessor] Starting job ${jobId} ` +
    `(type=${type}, attempt=${attempt}/${bullJob.opts.attempts ?? 3})`,
  );

  // Montar JobInput para o Orchestrator
  const input: JobInput = {
    fileUrl,
    type: INPUT_TYPE_MAP[type] ?? InputType.PDF,
    userContext: {
      name:      userContext.name,
      whatsapp:  userContext.whatsapp,
      instagram: userContext.instagram,
      site:      userContext.site,
      region:    userContext.region,
      logoUrl:   userContext.logoUrl,
    },
  };

  // Registrar job no Supabase na primeira tentativa
  if (attempt === 1) {
    await safeExec('pre-register job', async () => {
      if (jobRepo) {
        const now = new Date();
        const stubJob: Job = {
          id:        jobId,
          status:    JobStatus.PENDING,
          input,
          createdAt: now,
          updatedAt: now,
        };
        await jobRepo.createJob(stubJob);
      }
    });
  }

  // Marcar como processing
  await safeExec('updateStatus processing', async () => {
    await jobRepo?.updateStatus(jobId, 'processing');
  });

  const startTime = Date.now();

  try {
    // -----------------------------------------------------------------------
    // Executar pipeline
    // -----------------------------------------------------------------------
    const job = await orchestrator.process(input);
    const durationMs = Date.now() - startTime;

    if (job.status === 'completed' && job.result) {
      const result  = job.result;
      const artifacts = result.exportResult?.artifacts ?? [];

      // Persistir resultado no Supabase
      await safeExec('completeJob', async () => {
        await jobRepo?.completeJob(jobId, result, durationMs);
      });

      // Persistir artifacts
      if (artifacts.length > 0) {
        await safeExec('saveArtifacts', async () => {
          await artifactRepo?.saveArtifacts(jobId, artifacts);
        });

        await safeExec('saveFiles', async () => {
          await storageManager?.saveArtifactFiles(artifacts);
        });
      }

      logger.info(
        `[JobProcessor] ✓ Completed job ${jobId}: ` +
        `${artifacts.length} artifacts, ${durationMs}ms`,
      );

      // Webhook de conclusão
      if (webhookUrl) {
        await sendWebhook(webhookUrl, {
          source:          'bookagent',
          timestamp:       new Date().toISOString(),
          jobId,
          status:          'completed',
          artifacts_count: artifacts.length,
          duration_ms:     durationMs,
        });
      }
    } else {
      // Pipeline retornou status failed (não exception)
      await safeExec('failJob', async () => {
        await jobRepo?.failJob(jobId, job.error ?? 'Pipeline failed without error message');
      });

      if (webhookUrl) {
        await sendWebhook(webhookUrl, {
          source:    'bookagent',
          timestamp: new Date().toISOString(),
          jobId,
          status:    'failed',
          error:     job.error,
        });
      }
    }
  } catch (err) {
    // -----------------------------------------------------------------------
    // Pipeline lançou exceção — marcar como failed + re-throw para BullMQ
    // -----------------------------------------------------------------------
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);

    logger.error(
      `[JobProcessor] ✗ Job ${jobId} failed after ${durationMs}ms (attempt ${attempt}): ${message}`,
    );

    // Só marcar como failed na última tentativa (BullMQ não reprocessa depois)
    const maxAttempts = bullJob.opts.attempts ?? 3;
    if (attempt >= maxAttempts) {
      await safeExec('failJob on last attempt', async () => {
        await jobRepo?.failJob(jobId, message);
      });

      if (webhookUrl) {
        await sendWebhook(webhookUrl, {
          source:    'bookagent',
          timestamp: new Date().toISOString(),
          jobId,
          status:    'failed',
          error:     message,
        });
      }
    }

    throw err; // Re-throw → BullMQ gerencia retry com backoff
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function safeExec(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.warn(`[JobProcessor] Persistence failed [${label}]: ${err}`);
  }
}

async function sendWebhook(url: string, payload: WebhookPayload): Promise<void> {
  try {
    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (response.ok) {
      logger.info(`[JobProcessor] Webhook delivered → ${url} (${response.status})`);
    } else {
      logger.warn(`[JobProcessor] Webhook returned ${response.status} → ${url}`);
    }
  } catch (err) {
    // Webhook failure nunca interrompe o job
    logger.warn(`[JobProcessor] Webhook failed → ${url}: ${err}`);
  }
}
