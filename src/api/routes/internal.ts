/**
 * Internal Routes — endpoints chamados pelo Cloud Tasks
 *
 * Estes endpoints não devem ser chamados por usuários — eles são o
 * "webhook" que o Cloud Tasks invoca quando processa uma task.
 *
 * Proteção: todos usam cloudTasksAuth middleware que valida OIDC.
 *
 * Endpoints:
 *   POST /internal/execute-pipeline       — roda o pipeline completo de um job
 *   POST /internal/execute-video-render   — renderiza um vídeo (RenderSpec → MP4)
 */

import { Router, type Request, type Response } from 'express';
import { cloudTasksAuth } from '../middleware/cloud-tasks-auth.js';
import { logger } from '../../utils/logger.js';
import type { Orchestrator } from '../../core/orchestrator.js';
import type { PersistentOrchestrator } from '../../persistence/persistent-orchestrator.js';
import type { JobRepository } from '../../persistence/job-repository.js';
import type { ArtifactRepository } from '../../persistence/artifact-repository.js';
import type { StorageManager } from '../../persistence/storage-manager.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { executePipelineForTask } from '../../queue/job-processor.js';
import { processVideoRenderJob } from '../../queue/video-processor.js';
import type { PipelineTaskPayload, VideoRenderTaskPayload } from '../../queue/cloud-tasks.js';

const router = Router();
router.use(cloudTasksAuth);

// ---------------------------------------------------------------------------
// Dependency injection
// ---------------------------------------------------------------------------

interface InternalDeps {
  orchestrator: Orchestrator | PersistentOrchestrator;
  jobRepo: JobRepository | null;
  artifactRepo: ArtifactRepository | null;
  storageManager: StorageManager | null;
  supabaseClient: SupabaseClient | null;
}

let deps: InternalDeps | null = null;

export function setInternalRoutesDeps(d: InternalDeps): void {
  deps = d;
}

// ---------------------------------------------------------------------------
// POST /internal/execute-pipeline
// ---------------------------------------------------------------------------

router.post('/execute-pipeline', async (req: Request, res: Response) => {
  if (!deps) {
    res.status(503).json({ success: false, error: { code: 'NOT_READY' } });
    return;
  }

  const payload = req.body as PipelineTaskPayload;
  if (!payload?.jobId) {
    res.status(400).json({ success: false, error: { code: 'BAD_PAYLOAD', message: 'jobId missing' } });
    return;
  }

  logger.info(`[internal] execute-pipeline: job=${payload.jobId}`);

  // Responde 200 imediatamente — Cloud Tasks tem deadline (default 10min).
  // Se demorar mais, Cloud Tasks retry. Por isso respondemos rápido E
  // processamos. Se o processo for longo, o Cloud Tasks retry pode duplicar.
  // TODO: idempotência via job status check.
  try {
    await executePipelineForTask(payload, deps);
    res.status(200).json({ success: true, data: { jobId: payload.jobId, done: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[internal] execute-pipeline failed for ${payload.jobId}: ${msg}`);
    // 500 faz Cloud Tasks retry. 400 não.
    res.status(500).json({ success: false, error: { code: 'PIPELINE_FAILED', message: msg } });
  }
});

// ---------------------------------------------------------------------------
// POST /internal/execute-video-render
// ---------------------------------------------------------------------------

router.post('/execute-video-render', async (req: Request, res: Response) => {
  if (!deps) {
    res.status(503).json({ success: false, error: { code: 'NOT_READY' } });
    return;
  }

  const payload = req.body as VideoRenderTaskPayload;
  if (!payload?.jobId || !payload?.artifactId) {
    res.status(400).json({ success: false, error: { code: 'BAD_PAYLOAD' } });
    return;
  }

  logger.info(`[internal] execute-video-render: job=${payload.jobId} artifact=${payload.artifactId}`);

  try {
    // Wrap payload no formato que processVideoRenderJob espera (era BullJob)
    const fakeJob = {
      data: payload,
      attemptsMade: 0,
      opts: { attempts: 1 },
    } as unknown as Parameters<typeof processVideoRenderJob>[0];

    await processVideoRenderJob(fakeJob, {
      supabase: deps.supabaseClient,
      outputDir: 'storage/outputs/video',
      tempDir: 'storage/temp/video',
    });

    res.status(200).json({ success: true, data: { jobId: payload.jobId, done: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[internal] execute-video-render failed: ${msg}`);
    res.status(500).json({ success: false, error: { code: 'RENDER_FAILED', message: msg } });
  }
});

export default router;
