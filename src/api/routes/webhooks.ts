/**
 * Routes: Hotmart Webhook
 *
 * POST /webhooks/hotmart → recebe eventos de compra/cancelamento
 */

import { Router } from 'express';
import { handleHotmartWebhook } from '../controllers/hotmartWebhookController.js';

const router = Router();

router.post('/hotmart', handleHotmartWebhook);

export default router;
