/**
 * /internal router — DEPRECATED em Sprint 2.
 *
 * Stub que delega aos sub-routers de worker e renderer. Os aliases /internal/*
 * continuam respondendo (com cloudTasksAuth) durante a migração de tasks
 * Cloud Tasks que ainda apontam pros caminhos antigos.
 *
 * Implementações canônicas:
 *   - services/worker/internal-router.ts (/internal/execute-pipeline)
 *   - services/renderer/internal-router.ts (/internal/execute-video-render)
 *
 * @deprecated use services/worker e services/renderer.
 */

import { Router } from 'express';
import workerInternalRouter, { setWorkerInternalRouterDeps } from '../../services/worker/internal-router.js';
import rendererInternalRouter, { setRendererInternalRouterDeps } from '../../services/renderer/internal-router.js';
import type { TaskHandlerDeps } from '../../queue/task-handlers.js';

const router = Router();
router.use(workerInternalRouter);
router.use(rendererInternalRouter);

export function setInternalRoutesDeps(d: TaskHandlerDeps): void {
  setWorkerInternalRouterDeps(d);
  setRendererInternalRouterDeps(d);
}

export default router;
