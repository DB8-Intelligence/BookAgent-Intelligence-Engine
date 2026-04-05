/**
 * Routes: Operations Dashboard
 *
 * Endpoints operacionais protegidos por API key — monitoramento do sistema,
 * fila, custos e fase de crescimento.
 *
 * GET /ops/dashboard    → Visão operacional completa
 * GET /ops/queue        → Saúde da fila BullMQ
 * GET /ops/costs        → Análise de custos e margem
 * GET /ops/growth       → Fase de crescimento e recomendações
 *
 * Parte 57: Estratégia de Crescimento Escalável
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getOpsDashboard,
  getOpsQueue,
  getOpsCosts,
  getOpsGrowth,
} from '../controllers/opsController.js';

const router = Router();

// All ops endpoints require API key
router.use(authMiddleware);

router.get('/dashboard', getOpsDashboard);
router.get('/queue',     getOpsQueue);
router.get('/costs',     getOpsCosts);
router.get('/growth',    getOpsGrowth);

export default router;
