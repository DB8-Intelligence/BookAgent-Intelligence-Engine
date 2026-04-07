/**
 * Routes: Billing & Subscriptions
 *
 * POST /billing/webhooks/:provider                    → Webhook do gateway
 * POST /billing/subscriptions                         → Criar assinatura
 * GET  /billing/subscriptions/:tenantId               → Consultar assinatura
 * POST /billing/subscriptions/:tenantId/change-plan   → Upgrade/downgrade
 * POST /billing/subscriptions/:tenantId/cancel        → Cancelar
 * POST /billing/subscriptions/:tenantId/reactivate    → Reativar
 * GET  /billing/usage/:tenantId                       → Resumo de uso
 *
 * Parte 76: Billing Gateway Integration
 */

import { Router } from 'express';
import {
  handleWebhook,
  createSubscriptionEndpoint,
  getSubscriptionEndpoint,
  changePlanEndpoint,
  cancelSubscriptionEndpoint,
  reactivateSubscriptionEndpoint,
  getUsageEndpoint,
} from '../controllers/billingController.js';

const router = Router();

// Webhooks (gateway → BookAgent)
router.post('/webhooks/:provider', handleWebhook);

// Subscriptions
router.post('/subscriptions', createSubscriptionEndpoint);
router.get('/subscriptions/:tenantId', getSubscriptionEndpoint);
router.post('/subscriptions/:tenantId/change-plan', changePlanEndpoint);
router.post('/subscriptions/:tenantId/cancel', cancelSubscriptionEndpoint);
router.post('/subscriptions/:tenantId/reactivate', reactivateSubscriptionEndpoint);

// Usage
router.get('/usage/:tenantId', getUsageEndpoint);

export default router;
