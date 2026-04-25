/**
 * Internal Routes — DEPRECATED ALIAS de /tasks/*
 *
 * Estes endpoints ficam disponíveis durante 1 sprint pra migração suave do
 * Cloud Tasks queue (que apontava pra `/internal/execute-pipeline` e
 * `/internal/execute-video-render`). Tasks novas são enfileiradas pra
 * `/tasks/pipeline` e `/tasks/video` — estes aliases servem só pra absorver
 * tasks já em queue no momento do deploy.
 *
 * Endpoints (mantidos como alias):
 *   POST /internal/execute-pipeline       → /tasks/pipeline
 *   POST /internal/execute-video-render   → /tasks/video
 *
 * REMOVER no próximo sprint depois que Cloud Tasks UI/queues confirmarem
 * que não há mais tasks pendentes apontando pros caminhos antigos.
 */

import { Router, type Request, type Response } from 'express';
import { cloudTasksAuth } from '../middleware/cloud-tasks-auth.js';
import { logger } from '../../utils/logger.js';
import {
  handlePipelineTask,
  handleVideoTask,
  type TaskHandlerDeps,
} from '../../queue/task-handlers.js';
import type {
  PipelineTaskPayload,
  VideoRenderTaskPayload,
} from '../../queue/cloud-tasks.js';

const router = Router();
router.use(cloudTasksAuth);

// ---------------------------------------------------------------------------
// Dependency injection
// ---------------------------------------------------------------------------

let deps: TaskHandlerDeps | null = null;

export function setInternalRoutesDeps(d: TaskHandlerDeps): void {
  deps = d;
}

// ---------------------------------------------------------------------------
// POST /internal/execute-pipeline  (deprecated alias of /tasks/pipeline)
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

  logger.info(`[/internal/execute-pipeline] DEPRECATED — delegating to /tasks/pipeline (job=${payload.jobId})`);

  try {
    const result = await handlePipelineTask(payload, deps);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[/internal/execute-pipeline] failed for ${payload.jobId}: ${msg}`);
    res.status(500).json({ success: false, error: { code: 'PIPELINE_FAILED', message: msg } });
  }
});

// ---------------------------------------------------------------------------
// POST /internal/execute-video-render  (deprecated alias of /tasks/video)
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

  logger.info(
    `[/internal/execute-video-render] DEPRECATED — delegating to /tasks/video (job=${payload.jobId})`,
  );

  try {
    const result = await handleVideoTask(payload, deps);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[/internal/execute-video-render] failed: ${msg}`);
    res.status(500).json({ success: false, error: { code: 'RENDER_FAILED', message: msg } });
  }
});

export default router;
