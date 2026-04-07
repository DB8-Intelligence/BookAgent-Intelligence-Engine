/**
 * Routes: Campaign Execution
 *
 * Mounted under /campaigns prefix alongside campaign routes.
 *
 * Parte 87: Autonomous Campaign Execution
 */

import { Router } from 'express';
import {
  getExecution,
  getExecutionHistory,
  runExecution,
  getReadiness,
  getBlockedItems,
} from '../controllers/executionController.js';

const router = Router();

router.get('/:id/execution',              getExecution);
router.get('/:id/execution/history',       getExecutionHistory);
router.post('/:id/execution/run',          runExecution);
router.get('/:id/execution/readiness',     getReadiness);
router.get('/:id/execution/blocked',       getBlockedItems);

export default router;
