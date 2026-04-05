/**
 * Routes: Process
 *
 * POST /process — Iniciar processamento de material
 *
 * Middlewares (em ordem):
 *   1. requestRateLimiter — limita requests/min por user_id/IP
 *   2. planGuard          — valida limite mensal de jobs e jobs simultâneos
 *   3. jobRateLimiter     — limita jobs/hora por user_id
 *   4. createProcess      — controller de processamento
 *
 * Parte 55: middlewares de monetização e rate limiting adicionados
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { createProcess } from '../controllers/processController.js';
import { planGuard } from '../middleware/plan-guard.js';
import { requestRateLimiter, jobRateLimiter } from '../middleware/rate-limiter.js';

const router = Router();

router.post(
  '/',
  authMiddleware, // Protege o acesso geral ao engine
  requestRateLimiter,
  planGuard,
  jobRateLimiter,
  createProcess,
);

export default router;
