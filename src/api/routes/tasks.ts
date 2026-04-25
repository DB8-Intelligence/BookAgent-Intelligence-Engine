/**
 * Tasks Routes — endpoints async invocados pelo Cloud Tasks
 *
 * Este é o canonical endpoint set pra processamento async. Cada endpoint
 * recebe uma task do Cloud Tasks (POST com OIDC bearer token), delega ao
 * handler em `src/queue/task-handlers.ts` (que aplica idempotência via
 * Firestore tasks/{taskId}) e responde 200/500 conforme o desfecho.
 *
 * Endpoints:
 *   POST /tasks/pipeline      — pipeline completo de geração (17 estágios)
 *   POST /tasks/video         — render de vídeo (RenderSpec → MP4)
 *   POST /tasks/editorial     — step do bounded context editorial
 *   POST /tasks/publication   — n8n webhook + redes sociais
 *   POST /tasks/cleanup       — framework de cleanup (no-op)
 *
 * Auth: cloudTasksAuth middleware valida OIDC token. Requests sem token
 * válido são rejeitadas com 401.
 *
 * Idempotência: handler claims a task no Firestore antes de executar — se
 * já 'completed', retorna 200 sem reexecutar. Cloud Tasks também deduplica
 * no enfileiramento via taskName determinístico (defesa em profundidade).
 *
 * Os endpoints `/internal/execute-pipeline` e `/internal/execute-video-render`
 * em `routes/internal.ts` são aliases deprecated que delegam aos mesmos
 * handlers — manter por 1 sprint pra migração suave.
 */

import { Router, type Request, type Response } from 'express';
import { cloudTasksAuth } from '../middleware/cloud-tasks-auth.js';
import { logger } from '../../utils/logger.js';
import {
  handlePipelineTask,
  handleVideoTask,
  handleEditorialTask,
  handlePublicationTask,
  handleCleanupTask,
  type TaskHandlerDeps,
} from '../../queue/task-handlers.js';
import type {
  PipelineTaskPayload,
  VideoRenderTaskPayload,
  EditorialTaskPayload,
  PublicationTaskPayload,
  CleanupTaskPayload,
} from '../../queue/cloud-tasks.js';

const router = Router();
router.use(cloudTasksAuth);

// ---------------------------------------------------------------------------
// Dependency injection
// ---------------------------------------------------------------------------

let deps: TaskHandlerDeps | null = null;

export function setTasksRoutesDeps(d: TaskHandlerDeps): void {
  deps = d;
}

function notReady(res: Response): void {
  res.status(503).json({ success: false, error: { code: 'NOT_READY' } });
}

function badPayload(res: Response, message: string): void {
  res.status(400).json({ success: false, error: { code: 'BAD_PAYLOAD', message } });
}

// ---------------------------------------------------------------------------
// POST /tasks/pipeline
// ---------------------------------------------------------------------------

router.post('/pipeline', async (req: Request, res: Response) => {
  if (!deps) return notReady(res);

  const payload = req.body as PipelineTaskPayload;
  if (!payload?.jobId) return badPayload(res, 'jobId missing');

  try {
    const result = await handlePipelineTask(payload, deps);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[/tasks/pipeline] failed for ${payload.jobId}: ${msg}`);
    res.status(500).json({ success: false, error: { code: 'PIPELINE_FAILED', message: msg } });
  }
});

// ---------------------------------------------------------------------------
// POST /tasks/video
// ---------------------------------------------------------------------------

router.post('/video', async (req: Request, res: Response) => {
  if (!deps) return notReady(res);

  const payload = req.body as VideoRenderTaskPayload;
  if (!payload?.jobId || !payload?.artifactId) {
    return badPayload(res, 'jobId or artifactId missing');
  }

  try {
    const result = await handleVideoTask(payload, deps);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[/tasks/video] failed: ${msg}`);
    res.status(500).json({ success: false, error: { code: 'RENDER_FAILED', message: msg } });
  }
});

// ---------------------------------------------------------------------------
// POST /tasks/editorial
// ---------------------------------------------------------------------------

router.post('/editorial', async (req: Request, res: Response) => {
  if (!deps) return notReady(res);

  const payload = req.body as EditorialTaskPayload;
  if (!payload?.jobId || !payload?.stepName) {
    return badPayload(res, 'jobId or stepName missing');
  }

  try {
    const result = await handleEditorialTask(payload, deps);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[/tasks/editorial] failed for ${payload.jobId}/${payload.stepName}: ${msg}`);
    res.status(500).json({ success: false, error: { code: 'EDITORIAL_FAILED', message: msg } });
  }
});

// ---------------------------------------------------------------------------
// POST /tasks/publication
// ---------------------------------------------------------------------------

router.post('/publication', async (req: Request, res: Response) => {
  if (!deps) return notReady(res);

  const payload = req.body as PublicationTaskPayload;
  if (!payload?.jobId || !payload?.decision) {
    return badPayload(res, 'jobId or decision missing');
  }

  try {
    const result = await handlePublicationTask(payload, deps);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[/tasks/publication] failed for ${payload.jobId}: ${msg}`);
    res.status(500).json({ success: false, error: { code: 'PUBLICATION_FAILED', message: msg } });
  }
});

// ---------------------------------------------------------------------------
// POST /tasks/cleanup  (framework only — no real cleanup yet)
// ---------------------------------------------------------------------------

router.post('/cleanup', async (req: Request, res: Response) => {
  if (!deps) return notReady(res);

  const payload = req.body as CleanupTaskPayload;
  if (!payload?.scope) return badPayload(res, 'scope missing');

  try {
    const result = await handleCleanupTask(payload, deps);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[/tasks/cleanup] failed: ${msg}`);
    res.status(500).json({ success: false, error: { code: 'CLEANUP_FAILED', message: msg } });
  }
});

export default router;
