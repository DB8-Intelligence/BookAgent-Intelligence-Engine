/**
 * Routes: Continuous Improvement Loop / Meta-Optimization
 *
 * Parte 99: Continuous Improvement Loop / Meta-Optimization
 */

import { Router } from 'express';
import {
  runCycle,
  getInsights,
  getHistory,
  getLatest,
} from '../controllers/metaOptimizationController.js';

const router = Router();

router.post('/run',       runCycle);
router.get('/insights',   getInsights);
router.get('/history',    getHistory);
router.get('/latest',     getLatest);

export default router;
