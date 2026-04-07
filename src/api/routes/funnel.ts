/**
 * Routes: WhatsApp Funnel — Go-To-Market
 *
 * Parte 102: Go-To-Market
 */

import { Router } from 'express';
import {
  handleWhatsAppWebhook,
  getFunnelStatus,
} from '../controllers/whatsappFunnelController.js';

const router = Router();

router.post('/whatsapp/webhook',  handleWhatsAppWebhook);
router.get('/whatsapp/status',    getFunnelStatus);

export default router;
