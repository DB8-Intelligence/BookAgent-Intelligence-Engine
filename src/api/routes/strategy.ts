/**
 * Routes: Strategy
 *
 * Parte 84: Automated Strategy Layer
 */

import { Router } from 'express';
import {
  getStrategyOverview,
  getStrategyRecommendations,
  getStrategyMix,
  generateStrategyEndpoint,
} from '../controllers/strategyController.js';

const router = Router();

router.get('/overview',         getStrategyOverview);
router.get('/recommendations',  getStrategyRecommendations);
router.get('/mix',              getStrategyMix);
router.post('/generate',        generateStrategyEndpoint);

export default router;
