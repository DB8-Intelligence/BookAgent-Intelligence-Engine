/**
 * Routes: Campaign Optimization
 *
 * Mounted under /campaigns prefix.
 *
 * Parte 89: Goal-Driven Campaign Optimization
 */

import { Router } from 'express';
import {
  getOptimization,
  getOptimizationHistory,
  runOptimization,
  getCampaignGoals,
  getCampaignHealth,
} from '../controllers/optimizationController.js';

const router = Router();

router.get('/:id/optimization',              getOptimization);
router.get('/:id/optimization/history',       getOptimizationHistory);
router.post('/:id/optimization/run',          runOptimization);
router.get('/:id/optimization/goals',         getCampaignGoals);
router.get('/:id/optimization/health',        getCampaignHealth);

export default router;
