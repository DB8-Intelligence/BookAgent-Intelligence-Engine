/**
 * Billing (Firestore) — endpoints de consulta e upgrade sobre o profile.
 *
 * Substitui parcialmente billingController.ts/legacy (Supabase). Os webhooks
 * de Kiwify/Hotmart continuam gravando em Supabase por enquanto — bridge
 * pra Firestore vem em commit separado.
 *
 * Endpoints:
 *   GET  /api/v1/billing-fs/credits         → saldo detalhado (read-only)
 *   POST /api/v1/billing-fs/upgrade         → admin/manual (body: { planTier, resetPeriod? })
 */

import { Router, type Request, type Response } from 'express';
import {
  checkJobAllowed,
  checkRenderAllowed,
  upgradePlan,
} from '../../modules/billing/firestore-billing.js';
import type { PlanTier } from '../../plans/plan-config.js';
import { sendSuccess, sendError } from '../helpers/response.js';
import { logger } from '../../utils/logger.js';

const router = Router();

const VALID_TIERS: PlanTier[] = ['starter', 'pro', 'agency'];

router.get('/credits', async (req: Request, res: Response) => {
  if (!req.authUser?.id) {
    sendError(res, 'UNAUTHORIZED', 'Autenticação necessária', 401);
    return;
  }

  try {
    const [jobs, renders] = await Promise.all([
      checkJobAllowed(req.authUser.id, 0),   // count=0 → só leitura
      checkRenderAllowed(req.authUser.id, 0),
    ]);
    sendSuccess(res, {
      jobs: {
        used: jobs.used,
        limit: jobs.limit,
        remaining: jobs.remaining,
        allowed: jobs.allowed,
      },
      renders: {
        used: renders.used,
        limit: renders.limit,
        remaining: renders.remaining,
        allowed: renders.allowed,
      },
      resetAt: jobs.resetAt,
    });
  } catch (err) {
    logger.error(`[BillingFS] credits error: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Falha ao ler créditos', 500, err);
  }
});

router.post('/upgrade', async (req: Request, res: Response) => {
  if (!req.authUser?.id) {
    sendError(res, 'UNAUTHORIZED', 'Autenticação necessária', 401);
    return;
  }

  const { planTier, resetPeriod } = req.body ?? {};
  if (!VALID_TIERS.includes(planTier)) {
    sendError(res, 'BAD_REQUEST', `planTier inválido. Use: ${VALID_TIERS.join(', ')}`, 400);
    return;
  }

  try {
    const profile = await upgradePlan(req.authUser.id, planTier as PlanTier, {
      resetPeriod: resetPeriod === true,
    });
    sendSuccess(res, {
      planTier: profile.planTier,
      credits: profile.credits,
    });
  } catch (err) {
    logger.error(`[BillingFS] upgrade error: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Falha ao atualizar plano', 500, err);
  }
});

export default router;
