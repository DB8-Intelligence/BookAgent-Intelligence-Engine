/**
 * Routes: Partners, API Keys, Referrals & Webhooks
 *
 * Parte 103: Escala + API + Parcerias
 */

import { Router } from 'express';
import {
  handleCreatePartner,
  handleListPartners,
  handleGetByReferralCode,
  handleCreateApiKey,
  handleListApiKeys,
  handleRevokeApiKey,
  handleReferralClick,
  handleReferralConvert,
  handleRegisterWebhook,
  handleListWebhooks,
  handleTestWebhook,
} from '../controllers/partnerController.js';

const router = Router();

// Partner CRUD
router.post('/',                  handleCreatePartner);
router.get('/',                   handleListPartners);
router.get('/referral/:code',     handleGetByReferralCode);

// API Key Management
router.post('/api-keys',          handleCreateApiKey);
router.get('/api-keys',           handleListApiKeys);
router.delete('/api-keys/:id',    handleRevokeApiKey);

// Referral Tracking
router.post('/referrals/click',   handleReferralClick);
router.post('/referrals/convert', handleReferralConvert);

// Integration Webhooks
router.post('/webhooks',          handleRegisterWebhook);
router.get('/webhooks',           handleListWebhooks);
router.post('/webhooks/test',     handleTestWebhook);

export default router;
