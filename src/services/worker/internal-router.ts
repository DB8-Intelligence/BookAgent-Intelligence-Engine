/**
 * Worker Internal Router — DEPRECATED alias /internal/execute-pipeline.
 *
 * Subset do router antigo /internal que pertence ao worker. Existe
 * apenas pra absorver tasks Cloud Tasks já enfileiradas no caminho
 * antigo durante a migração. Quando Cloud Tasks confirmar que não há
 * mais tasks pendentes nesse caminho, este arquivo pode ser deletado.
 */

import { Router, type Request, type Response } from 'express';
import { cloudTasksAuth } from '../../api/middleware/cloud-tasks-auth.js';
import { logger } from '../../utils/logger.js';
import { handlePipelineTask, type TaskHandlerDeps } from './handlers.js';
import type { PipelineTaskPayload } from '../../queue/cloud-tasks.js';

const router = Router();
router.use(cloudTasksAuth);

let deps: TaskHandlerDeps | null = null;

export function setWorkerInternalRouterDeps(d: TaskHandlerDeps): void {
  deps = d;
}

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

  logger.info(`[/internal/execute-pipeline] DEPRECATED — delegating (job=${payload.jobId})`);

  try {
    const result = await handlePipelineTask(payload, deps);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[/internal/execute-pipeline] failed for ${payload.jobId}: ${msg}`);
    res.status(500).json({ success: false, error: { code: 'PIPELINE_FAILED', message: msg } });
  }
});

export default router;
