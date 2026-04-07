/**
 * Routes: Distribution & Monetization
 * Parte 103: Escala
 */

import { Router } from 'express';
import {
  handleCreateChannel,
  handleListChannels,
  handleDistributionOverview,
  handleCreateWhiteLabel,
  handleGetWhiteLabel,
  handleCreatePayout,
  handleListPayouts,
  handleApprovePayout,
  handleGetApiPricing,
  handleListApiInvoices,
} from '../controllers/distributionController.js';

const router = Router();

// Distribution Channels
router.post('/channels',                    handleCreateChannel);
router.get('/channels',                     handleListChannels);
router.get('/overview',                     handleDistributionOverview);

// White-Label
router.post('/white-label',                 handleCreateWhiteLabel);
router.get('/white-label/:partnerId',       handleGetWhiteLabel);

// Affiliate Payouts
router.post('/payouts',                     handleCreatePayout);
router.get('/payouts/:partnerId',           handleListPayouts);
router.patch('/payouts/:id/approve',        handleApprovePayout);

// API Pricing & Invoices
router.get('/api-pricing',                  handleGetApiPricing);
router.get('/api-invoices',                 handleListApiInvoices);

export default router;
