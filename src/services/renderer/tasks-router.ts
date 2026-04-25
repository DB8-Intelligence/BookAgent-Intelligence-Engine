/**
 * Renderer Tasks Router — endpoint /tasks/video.
 *
 * Subset do router em src/api/routes/tasks.ts que pertence ao role
 * renderer. Em modo "all" coexiste com o tasks-router do worker sob /tasks.
 *
 * Auth: cloudTasksAuth (OIDC). Sem firebaseAuth — Cloud Tasks não envia
 * token Firebase.
 */

import { Router, type Request, type Response } from 'express';
import { cloudTasksAuth } from '../../api/middleware/cloud-tasks-auth.js';
import { logger } from '../../utils/logger.js';
import { handleVideoTask, type TaskHandlerDeps } from './handlers.js';
import type { VideoRenderTaskPayload } from '../../queue/cloud-tasks.js';

const router = Router();
router.use(cloudTasksAuth);

let deps: TaskHandlerDeps | null = null;

export function setRendererTasksRouterDeps(d: TaskHandlerDeps): void {
  deps = d;
}

router.post('/video', async (req: Request, res: Response) => {
  if (!deps) {
    res.status(503).json({ success: false, error: { code: 'NOT_READY' } });
    return;
  }

  const payload = req.body as VideoRenderTaskPayload;
  if (!payload?.jobId || !payload?.artifactId) {
    res.status(400).json({ success: false, error: { code: 'BAD_PAYLOAD', message: 'jobId or artifactId missing' } });
    return;
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

export default router;
