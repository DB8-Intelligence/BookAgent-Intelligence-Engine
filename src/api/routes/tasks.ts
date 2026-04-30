/**
 * /tasks router — DEPRECATED em Sprint 2.
 *
 * Este arquivo virou stub. As implementações canônicas dos endpoints
 * /tasks/* foram movidas para:
 *   - services/worker/tasks-router.ts (pipeline, editorial, publication, cleanup)
 *   - services/renderer/tasks-router.ts (video)
 *
 * Em modo "all" o index.ts monta diretamente as compositions de worker
 * e renderer — não passa mais por aqui. O stub continua existindo
 * (e apenas re-mounta os dois sub-routers) pra back-compat caso algum
 * caller futuro importe `tasksRoutes` ou `setTasksRoutesDeps`.
 *
 * Nada novo deve ser adicionado neste arquivo. Próxima sprint pode
 * deletá-lo após confirmar que não há imports remanescentes.
 *
 * @deprecated use services/worker e services/renderer.
 */

import { Router } from 'express';
import workerTasksRouter, { setWorkerTasksRouterDeps } from '../../services/worker/tasks-router.js';
import rendererTasksRouter, { setRendererTasksRouterDeps } from '../../services/renderer/tasks-router.js';
import type { TaskHandlerDeps } from '../../queue/task-handlers.js';

const router = Router();
router.use(workerTasksRouter);
router.use(rendererTasksRouter);

export function setTasksRoutesDeps(d: TaskHandlerDeps): void {
  setWorkerTasksRouterDeps(d);
  setRendererTasksRouterDeps(d);
}

export default router;
