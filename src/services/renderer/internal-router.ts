/**
 * Renderer Internal Router — DEPRECATED alias /internal/execute-video-render.
 *
 * Subset do router antigo /internal que pertence ao renderer. Mantido pra
 * absorver tasks Cloud Tasks já enfileiradas no caminho antigo durante a
 * migração. Quando confirmarmos que a queue não tem mais tasks pendentes
 * neste caminho, este arquivo pode ser deletado.
 */

import { Router, type Request, type Response } from 'express';
import { cloudTasksAuth } from '../../api/middleware/cloud-tasks-auth.js';
import { logger } from '../../utils/logger.js';
import { handleVideoTask, type TaskHandlerDeps } from './handlers.js';
import type { VideoRenderTaskPayload } from '../../queue/cloud-tasks.js';

const router = Router();
router.use(cloudTasksAuth);

let deps: TaskHandlerDeps | null = null;

export function setRendererInternalRouterDeps(d: TaskHandlerDeps): void {
  deps = d;
}

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

  logger.info(`[/internal/execute-video-render] DEPRECATED — delegating (job=${payload.jobId})`);

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
