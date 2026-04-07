/**
 * Routes: Acquisition & Growth Automation
 * Parte 103: Escala
 */

import { Router } from 'express';
import {
  handleCreateCampaign,
  handleListCampaigns,
  handleScheduleContent,
  handleListSchedules,
  handleCreateSequence,
  handleListSequences,
  handleTrackConversion,
  handleListConversions,
  handleGrowthDashboard,
} from '../controllers/acquisitionController.js';

const router = Router();

// Campaigns
router.post('/campaigns',        handleCreateCampaign);
router.get('/campaigns',         handleListCampaigns);

// Content Scheduling
router.post('/schedules',        handleScheduleContent);
router.get('/schedules',         handleListSchedules);

// Nurturing Sequences
router.post('/sequences',        handleCreateSequence);
router.get('/sequences',         handleListSequences);

// Conversion Tracking
router.post('/conversions',      handleTrackConversion);
router.get('/conversions',       handleListConversions);

// Growth Dashboard
router.get('/growth-dashboard',  handleGrowthDashboard);

export default router;
