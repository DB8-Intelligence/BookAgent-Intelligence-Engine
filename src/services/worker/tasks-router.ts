/**
 * Worker Tasks Router — endpoints /tasks/{pipeline,editorial,publication,cleanup}
 *
 * Subset do router em src/api/routes/tasks.ts que pertence ao role worker.
 * O endpoint /tasks/video é responsabilidade do role renderer (em
 * services/renderer/tasks-router.ts). Os dois routers são montados sob o
 * mesmo prefixo /tasks no index.ts em modo "all" — Express despacha por
 * path sem conflito (paths não se sobrepõem).
 *
 * Auth: cloudTasksAuth (OIDC) aplicado dentro do router. Não usa
 * firebaseAuth — Cloud Tasks não envia tokens Firebase.
 */

import { Router, type Request, type Response } from 'express';
import { cloudTasksAuth } from '../../api/middleware/cloud-tasks-auth.js';
import { logger } from '../../utils/logger.js';
import {
  handlePipelineTask,
  handleEditorialTask,
  handlePublicationTask,
  handleCleanupTask,
  type TaskHandlerDeps,
} from './handlers.js';
import type {
  PipelineTaskPayload,
  EditorialTaskPayload,
  PublicationTaskPayload,
  CleanupTaskPayload,
} from '../../queue/cloud-tasks.js';

const router = Router();
router.use(cloudTasksAuth);

let deps: TaskHandlerDeps | null = null;

export function setWorkerTasksRouterDeps(d: TaskHandlerDeps): void {
  deps = d;
}

function notReady(res: Response): void {
  res.status(503).json({ success: false, error: { code: 'NOT_READY' } });
}

function badPayload(res: Response, message: string): void {
  res.status(400).json({ success: false, error: { code: 'BAD_PAYLOAD', message } });
}

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
