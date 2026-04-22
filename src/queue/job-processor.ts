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
import { enqueueVideoRender } from './video-queue.js';
import { checkAndRecordUsage } from '../modules/billing/limit-checker.js';
import { recordUsage } from '../modules/billing/usage-meter.js';
import { UsageEventType, LimitCheckResult } from '../domain/entities/billing.js';
import { TenantRole, PLAN_FEATURES, PLAN_TENANT_LIMITS, LearningScope } from '../domain/entities/tenant.js';
import type { TenantContext } from '../domain/entities/tenant.js';
import type { PlanTier } from '../plans/plan-config.js';
import { SupabaseClient } from '../persistence/supabase-client.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessorDependencies {
  orchestrator: Orchestrator;
  jobRepo: JobRepository | null;
  artifactRepo: ArtifactRepository | null;
  storageManager: StorageManager | null;
  supabaseClient?: SupabaseClient | null;
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

  // Build TenantContext for credit checks (from queue data)
  const queueTenant = bullJob.data.tenantContext;
  const planTier = (queueTenant?.planTier ?? 'starter') as PlanTier;
  const tenantCtx: TenantContext | null = queueTenant
    ? {
        tenantId: queueTenant.tenantId,
        userId: queueTenant.userId,
        userRole: TenantRole.OWNER,
        planTier,
        features: PLAN_FEATURES[planTier] ?? PLAN_FEATURES['starter'],
        limits: PLAN_TENANT_LIMITS[planTier] ?? PLAN_TENANT_LIMITS['starter'],
        learningScope: (queueTenant.learningScope as LearningScope) ?? LearningScope.TENANT,
      }
    : null;

  const supabase = deps.supabaseClient ?? null;

  // Credit check: verify tenant has remaining quota before processing
  if (tenantCtx) {
    const creditCheck = await checkAndRecordUsage(
      tenantCtx,
      UsageEventType.JOB_CREATED,
      supabase,
      { jobId },
    );

    if (creditCheck.result === LimitCheckResult.BLOCKED) {
      logger.warn(
        `[JobProcessor] BLOCKED by credit limit: ${creditCheck.message} ` +
        `(tenant=${tenantCtx.tenantId}, plan=${tenantCtx.planTier})`,
      );

      await safeExec('failJob credit block', async () => {
        await jobRepo?.failJob(jobId, `Limite atingido: ${creditCheck.message}`);
      });

      if (webhookUrl) {
        await sendWebhook(webhookUrl, {
          source: 'bookagent',
          timestamp: new Date().toISOString(),
          jobId,
          status: 'failed',
          error: creditCheck.message,
        });
      }

      return; // Don't process — credit exhausted
    }

    if (creditCheck.result === LimitCheckResult.WARNING) {
      logger.info(`[JobProcessor] Credit warning: ${creditCheck.message}`);
    }
  }

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

      // Persist asset URL map for video rendering (if available)
      const resultAny = result as unknown as Record<string, unknown>;
      const assetUrlMap = resultAny.assetUrlMap as Record<string, string> | undefined;
      if (assetUrlMap && Object.keys(assetUrlMap).length > 0 && jobRepo) {
        await safeExec('saveAssetUrlMap', async () => {
          await jobRepo.updateAssetUrlMap(jobId, assetUrlMap);
        });
        logger.info(`[JobProcessor] Saved assetUrlMap with ${Object.keys(assetUrlMap).length} entries for job ${jobId}`);
      }

      // Save processingId (orchestrator internal ID used for storage paths)
      // This is different from jobId because orchestrator.process() creates its own UUID
      if (jobRepo) {
        await safeExec('saveProcessingId', async () => {
          await jobRepo.updateAssetUrlMap(jobId, {
            ...(assetUrlMap ?? {}),
            __processingId: job.id, // Internal ID used as storage key in Supabase bucket
          });
        });
      }

      // Persistir artifacts
      if (artifacts.length > 0) {
        await safeExec('saveArtifacts', async () => {
          await artifactRepo?.saveArtifacts(jobId, artifacts);
        });

        await safeExec('saveFiles', async () => {
          await storageManager?.saveArtifactFiles(artifacts);
        });
      }

      // Record usage for generated artifacts (best-effort)
      if (tenantCtx) {
        const blogCount = artifacts.filter(a => a.artifactType === 'blog-article').length;
        const lpCount = artifacts.filter(a => a.artifactType === 'landing-page').length;
        const renderCount = artifacts.filter(a => a.artifactType === 'media-render-spec').length;

        const usageEvents: Array<{ type: UsageEventType; count: number }> = [
          { type: UsageEventType.JOB_COMPLETED, count: 1 },
          { type: UsageEventType.BLOG_GENERATED, count: blogCount },
          { type: UsageEventType.LANDING_PAGE_GENERATED, count: lpCount },
          { type: UsageEventType.VIDEO_RENDER_REQUESTED, count: renderCount },
        ];

        for (const { type: evtType, count } of usageEvents) {
          if (count > 0) {
            await safeExec(`recordUsage ${evtType}`, async () => {
              await recordUsage({
                tenantId: tenantCtx.tenantId,
                userId: tenantCtx.userId,
                eventType: evtType,
                quantity: count,
                jobId,
              }, supabase);
            });
          }
        }
      }

      logger.info(
        `[JobProcessor] ✓ Completed job ${jobId}: ` +
        `${artifacts.length} artifacts, ${durationMs}ms`,
      );

      // Auto-trigger video renders for all media-render-spec artifacts
      const renderSpecs = artifacts.filter(
        (a) => a.artifactType === 'media-render-spec',
      );

      if (renderSpecs.length > 0 && supabase) {
        // Mark video_render_status=queued up-front so frontend polling works
        // and we have visibility if enqueue fails (no row = enqueue crashed).
        try {
          await supabase.upsert(
            'bookagent_job_meta',
            {
              job_id: jobId,
              video_render_status: 'queued',
              video_render_artifact_id: renderSpecs[0].id,
              video_render_requested_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            'job_id',
          );
        } catch (err) {
          logger.warn(`[JobProcessor] Failed to mark video_render_status=queued: ${err}`);
        }
      }

      for (const spec of renderSpecs) {
        try {
          const specContent = typeof spec.content === 'string'
            ? spec.content
            : JSON.stringify(spec.content);

          await enqueueVideoRender({
            jobId,
            artifactId: spec.id,
            renderSpecJson: specContent,
            assetUrls: assetUrlMap ?? {},
          });
          logger.info(
            `[JobProcessor] Auto-triggered video render for artifact ${spec.id}`,
          );
        } catch (err) {
          // Log prominently — this was previously swallowed by safeExec
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(
            `[JobProcessor] AUTO-TRIGGER FAILED for ${spec.id}: ${msg}. ` +
            `User will need to click "Gerar Video" manually.`,
          );
          // Mark as failed in job_meta so UI shows error instead of hanging on "queued"
          if (supabase) {
            await supabase.upsert(
              'bookagent_job_meta',
              {
                job_id: jobId,
                video_render_status: 'failed',
                video_render_error: `Auto-trigger failed: ${msg}`,
                updated_at: new Date().toISOString(),
              },
              'job_id',
            ).catch(() => {});
          }
        }
      }

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
