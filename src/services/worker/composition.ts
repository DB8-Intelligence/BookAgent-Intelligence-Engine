/**
 * Worker composition — monta as rotas do role worker em uma instância Express.
 *
 * Express aceita múltiplos `app.use(path, router)` para o mesmo prefixo —
 * em modo "all", esta composition + a do renderer co-existem sob /tasks
 * e /internal sem conflito (paths não se sobrepõem).
 */

import type { Express } from 'express';
import workerTasksRouter, { setWorkerTasksRouterDeps } from './tasks-router.js';
import workerInternalRouter, { setWorkerInternalRouterDeps } from './internal-router.js';
import type { TaskHandlerDeps } from './handlers.js';

export function mountWorkerRoutes(app: Express, deps: TaskHandlerDeps): void {
  setWorkerTasksRouterDeps(deps);
  setWorkerInternalRouterDeps(deps);
  app.use('/tasks', workerTasksRouter);
  app.use('/internal', workerInternalRouter);
}
