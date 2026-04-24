/**
 * Job Processor — Lógica central de processamento de jobs
 *
 * Chamado pelo endpoint /internal/execute-pipeline quando uma task Cloud
 * Tasks é recebida. Também chamado inline em sync mode.
 *
 * Responsável por:
 *   1. Registrar job no Supabase (status=pending)
 *   2. Marcar como processing
 *   3. Executar o pipeline via Orchestrator
 *   4. Persistir resultado (Supabase + disco)
 *   5. Enviar webhook de conclusão (se configurado)
 *   6. Em erro: marcar como failed + re-throw para Cloud Tasks retry (HTTP 500)
 */

import type { BookAgentJobData, WebhookPayload } from './types.js';
import type { PipelineTaskPayload } from './cloud-tasks.js';
import type { Orchestrator } from '../core/orchestrator.js';
import type { PersistentOrchestrator } from '../persistence/persistent-orchestrator.js';
import type { JobRepository } from '../persistence/job-repository.js';
import type { ArtifactRepository } from '../persistence/artifact-repository.js';
import type { StorageManager } from '../persistence/storage-manager.js';
import { InputType, JobStatus } from '../domain/value-objects/index.js';
import type { Job, JobInput } from '../domain/entities/job.js';
import { enqueueVideoRender } from './video-queue.js';
import { isCloudTasksConfigured } from './cloud-tasks.js';
import { checkAndRecordUsage } from '../modules/billing/limit-checker.js';
import { recordUsage } from '../modules/billing/usage-meter.js';
import {
  createJob as createJobInFirestore,
  updateJob as updateJobInFirestore,
  saveArtifact as saveArtifactInFirestore,
} from '../persistence/google-persistence.js';
import {
  checkJobAllowed,
  consumeJobCredit,
  consumeRenderCredit,
  CreditLimitError,
} from '../modules/billing/firestore-billing.js';
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
  orchestrator: Orchestrator | PersistentOrchestrator;
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
 * Processa um pipeline task. Aceita payload plain (vindo do Cloud Tasks
 * via POST /internal/execute-pipeline) OU diretamente em sync mode.
 *
 * Lança erro em falhas de pipeline — caller decide o que fazer:
 *   - Cloud Tasks HTTP handler: retorna 500, Cloud Tasks retry
 *   - Sync mode: propaga pro controller que responde 500 ao client
 *
 * Falhas de persistência são silenciosas (best-effort).
 */
export async function executePipelineForTask(
  payload: PipelineTaskPayload | BookAgentJobData,
  deps: ProcessorDependencies,
): Promise<void> {
  const { jobId, fileUrl, type, userContext, webhookUrl } = payload;
  const { orchestrator, jobRepo, artifactRepo, storageManager } = deps;

  logger.info(
    `[JobProcessor] Starting job ${jobId} (type=${type})`,
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
      // Forward selectedFormats so ProcessingContext.userSelectedFormats is populated
      // and output-selection filters to only the formats the user picked in the wizard
      selectedFormats: userContext.selectedFormats,
    },
  };

  // Registrar job no Supabase. Em Cloud Tasks retry, createJob é idempotent
  // (upsert) — se falhar por duplicidade, safeExec loga e segue.
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

  // Dual-write: registra também no Firestore (fonte primária do dashboard)
  await safeExec('firestore createJob', async () => {
    const qt = payload.tenantContext;
    await createJobInFirestore({
      jobId,
      tenantId: qt?.tenantId ?? jobId,
      userId: qt?.userId ?? jobId,
      inputType: (type as 'pdf' | 'video' | 'audio' | 'pptx' | 'document') ?? 'pdf',
      inputFileUrl: fileUrl ?? null,
      status: 'pending',
      currentStage: null,
      stageIndex: -1,
      totalStages: 17,
      errorMessage: null,
      selectedFormats: userContext.selectedFormats
        ? userContext.selectedFormats.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      startedAt: new Date().toISOString(),
      completedAt: null,
    });
  });

  // Marcar como processing
  await safeExec('updateStatus processing', async () => {
    await jobRepo?.updateStatus(jobId, 'processing');
  });
  await safeExec('firestore processing', async () => {
    await updateJobInFirestore(jobId, { status: 'processing' });
  });

  // Build TenantContext for credit checks (from task payload)
  const queueTenant = payload.tenantContext;
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

  // Credit check: primary path é Firestore transaction (atômico por uid).
  // Fallback Supabase rola só se não tem tenantCtx firebase-uid-like.
  if (tenantCtx) {
    try {
      // consumeJobCredit transação: valida limite + incrementa. Se estoura,
      // lança CreditLimitError e o pipeline nem começa. Idempotência em
      // Cloud Tasks retry: se createJob já rodou antes, este é o 2º retry
      // e o consume vai rodar 2x — aceita-se a duplicação pra MVP; pra
      // idempotência forte, marcar jobId como "credit-consumed" num flag.
      await consumeJobCredit(tenantCtx.userId, 1);
      logger.info(`[JobProcessor] credit consumed uid=${tenantCtx.userId}`);
    } catch (err) {
      if (err instanceof CreditLimitError) {
        logger.warn(
          `[JobProcessor] BLOCKED by Firestore credit limit: ${err.message} ` +
          `(uid=${tenantCtx.userId}, remaining=${err.remaining}/${err.limit})`,
        );

        await safeExec('failJob credit block', async () => {
          await jobRepo?.failJob(jobId, `Limite atingido: ${err.message}`);
        });
        await safeExec('firestore failJob credit', async () => {
          await updateJobInFirestore(jobId, {
            status: 'failed',
            errorMessage: `Limite atingido: ${err.message}`,
            completedAt: new Date().toISOString(),
          });
        });

        if (webhookUrl) {
          await sendWebhook(webhookUrl, {
            source: 'bookagent',
            timestamp: new Date().toISOString(),
            jobId,
            status: 'failed',
            error: err.message,
          });
        }
        return; // credit exhausted — bail out
      }
      // Erro diferente (Firestore offline, etc) → loga e cai no fallback
      // Supabase abaixo. Preferimos deixar o user processar do que bloquear
      // por falha de infra.
      logger.error(
        `[JobProcessor] Firestore credit check failed, falling back to Supabase: ${err}`,
      );
    }

    // Supabase legacy path — registra usage event só pra analytics/billing
    // legados (bookagent_monthly_usage). Não bloqueia: já consumimos acima.
    const creditCheck = await checkAndRecordUsage(
      tenantCtx,
      UsageEventType.JOB_CREATED,
      supabase,
      { jobId },
    );

    if (creditCheck.result === LimitCheckResult.BLOCKED) {
      logger.warn(
        `[JobProcessor] Supabase secondary block: ${creditCheck.message}`,
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

      // Dual-write: atualiza Firestore (status + completion time)
      await safeExec('firestore completeJob', async () => {
        await updateJobInFirestore(jobId, {
          status: 'completed',
          completedAt: new Date().toISOString(),
          currentStage: null,
          stageIndex: 17,
        });
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

        // Dual-write: grava artifacts no Firestore com tenantId denormalizado
        // pra a galeria do dashboard encontrar por tenant sem precisar de JOIN.
        const tid = tenantCtx?.tenantId ?? jobId;
        await safeExec('firestore saveArtifacts', async () => {
          await Promise.all(
            artifacts.map((a) =>
              saveArtifactInFirestore({
                artifactId: a.id,
                jobId,
                tenantId: tid,
                artifactType: a.artifactType,
                exportFormat: a.exportFormat ?? null,
                title: a.title ?? a.artifactType,
                sizeBytes: a.sizeBytes ?? null,
                publicUrl: (a as unknown as { publicUrl?: string }).publicUrl ?? null,
                filePath: (a as unknown as { filePath?: string }).filePath ?? null,
                mimeType: inferMimeTypeFromArtifact(a),
                status: (a.status === 'valid' || a.status === 'partial' || a.status === 'invalid')
                  ? a.status
                  : 'valid',
              }),
            ),
          );
        });
      }

      // Render credits — jobCredit já foi consumido no pre-flight, agora
      // cobra os renders produzidos. consumeRenderCredit também faz check,
      // mas se estourar aqui o job já completou: loga e segue (não rollback).
      if (tenantCtx) {
        const renderCount = artifacts.filter(
          (a) => a.artifactType === 'media-render-spec',
        ).length;
        if (renderCount > 0) {
          await safeExec('firestore consume renders', async () => {
            try {
              await consumeRenderCredit(tenantCtx.userId, renderCount);
            } catch (err) {
              if (err instanceof CreditLimitError) {
                logger.warn(
                  `[JobProcessor] Render credit overflow uid=${tenantCtx.userId} ` +
                  `tried=${renderCount} remaining=${err.remaining}. ` +
                  `Artifact gerou mas ultrapassou limite — admin review.`,
                );
              } else {
                throw err;
              }
            }
          });
        }
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

      // Detect Cloud Tasks availability — sem Cloud Tasks rodamos video
      // render INLINE (mesmo processo via ffmpeg local). Com Cloud Tasks,
      // enfileiramos pro endpoint /internal/execute-video-render.
      const hasCloudTasks = isCloudTasksConfigured();

      for (const spec of renderSpecs) {
        try {
          const specContent = typeof spec.content === 'string'
            ? spec.content
            : JSON.stringify(spec.content);

          if (hasCloudTasks) {
            await enqueueVideoRender({
              jobId,
              artifactId: spec.id,
              renderSpecJson: specContent,
              assetUrls: assetUrlMap ?? {},
            });
            logger.info(
              `[JobProcessor] Auto-triggered video render (queued) for artifact ${spec.id}`,
            );
          } else {
            // Sync fallback — processa inline via ffmpeg local.
            logger.info(
              `[JobProcessor] Cloud Tasks off — rendering INLINE for artifact ${spec.id}`,
            );
            const { processVideoRenderJob } = await import('./video-processor.js');
            await processVideoRenderJob(
              {
                jobId,
                artifactId: spec.id,
                renderSpecJson: specContent,
                assetUrls: assetUrlMap ?? {},
              },
              {
                supabase: supabase ?? null,
                outputDir: 'storage/outputs/video',
                tempDir: 'storage/temp/video',
              },
            );
            logger.info(
              `[JobProcessor] Inline video render complete for artifact ${spec.id}`,
            );
          }
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
      await safeExec('firestore failJob', async () => {
        await updateJobInFirestore(jobId, {
          status: 'failed',
          errorMessage: job.error ?? 'Pipeline failed without error message',
          completedAt: new Date().toISOString(),
        });
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
    // Pipeline lançou exceção — marcar como failed + re-throw
    // Cloud Tasks: HTTP 500 response triggera retry automático
    // Sync mode: exceção propaga pro controller que responde 500 ao client
    // -----------------------------------------------------------------------
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);

    logger.error(
      `[JobProcessor] ✗ Job ${jobId} failed after ${durationMs}ms: ${message}`,
    );

    await safeExec('failJob', async () => {
      await jobRepo?.failJob(jobId, message);
    });
    await safeExec('firestore failJob exception', async () => {
      await updateJobInFirestore(jobId, {
        status: 'failed',
        errorMessage: message,
        completedAt: new Date().toISOString(),
      });
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

    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helper — infer MIME type from artifact shape (used by Firestore writes)
// ---------------------------------------------------------------------------
function inferMimeTypeFromArtifact(a: {
  artifactType: string;
  exportFormat?: string | null;
  publicUrl?: string;
  filePath?: string;
}): string | null {
  const url = (a.publicUrl ?? a.filePath ?? '').toLowerCase();
  if (url.endsWith('.mp4') || url.endsWith('.mov')) return 'video/mp4';
  if (url.endsWith('.webm')) return 'video/webm';
  if (url.endsWith('.png')) return 'image/png';
  if (url.endsWith('.jpg') || url.endsWith('.jpeg')) return 'image/jpeg';
  if (url.endsWith('.pdf')) return 'application/pdf';
  if (url.endsWith('.mp3')) return 'audio/mpeg';
  if (a.artifactType.toUpperCase().includes('VIDEO')) return 'video/mp4';
  if (a.exportFormat === 'html') return 'text/html';
  if (a.exportFormat === 'json') return 'application/json';
  if (a.exportFormat === 'markdown') return 'text/markdown';
  return null;
}

// Alias de compatibilidade — código antigo importava processBookAgentJob
export { executePipelineForTask as processBookAgentJob };

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
