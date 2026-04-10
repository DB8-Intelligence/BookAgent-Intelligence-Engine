/**
 * Routes: Webhooks — Hotmart + Kiwify
 *
 * POST /webhooks/hotmart → eventos Hotmart
 * POST /webhooks/kiwify  → eventos Kiwify
 */

import { Router } from 'express';
import { handleHotmartWebhook } from '../controllers/hotmartWebhookController.js';
import { handleKiwifyWebhook } from '../controllers/kiwifyWebhookController.js';

const router = Router();

router.post('/hotmart', handleHotmartWebhook);
router.post('/kiwify',  handleKiwifyWebhook);

export default router;
