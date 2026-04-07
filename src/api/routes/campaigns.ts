/**
 * Routes: Campaigns
 *
 * Parte 85: Content Campaign Orchestration
 */

import { Router } from 'express';
import {
  createCampaign,
  listCampaignsEndpoint,
  getCampaignDetail,
  getCampaignItems,
  updateCampaignStatus,
  updateCampaignItem,
  generateCampaignOutputs,
} from '../controllers/campaignController.js';

const router = Router();

router.post('/',                    createCampaign);
router.get('/',                     listCampaignsEndpoint);
router.get('/:id',                  getCampaignDetail);
router.get('/:id/items',            getCampaignItems);
router.patch('/:id/status',         updateCampaignStatus);
router.patch('/:id/items/:itemId',  updateCampaignItem);
router.post('/:id/generate',        generateCampaignOutputs);

export default router;
