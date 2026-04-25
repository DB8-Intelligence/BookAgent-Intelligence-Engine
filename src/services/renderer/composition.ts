/**
 * Renderer composition — monta as rotas do role renderer em uma instância Express.
 */

import type { Express } from 'express';
import rendererTasksRouter, { setRendererTasksRouterDeps } from './tasks-router.js';
import rendererInternalRouter, { setRendererInternalRouterDeps } from './internal-router.js';
import type { TaskHandlerDeps } from './handlers.js';

export function mountRendererRoutes(app: Express, deps: TaskHandlerDeps): void {
  setRendererTasksRouterDeps(deps);
  setRendererInternalRouterDeps(deps);
  app.use('/tasks', rendererTasksRouter);
  app.use('/internal', rendererInternalRouter);
}
