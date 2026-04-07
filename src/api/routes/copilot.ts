/**
 * Routes: Executive Co-Pilot / Operations Advisor
 *
 * Parte 95: Executive Co-Pilot / Operations Advisor
 */

import { Router } from 'express';
import {
  getOverview,
  getAdvisories,
  getNextActions,
  getExecutiveSummary,
  getOperationalSummary,
} from '../controllers/copilotController.js';

const router = Router();

router.get('/overview',              getOverview);
router.get('/advisories',            getAdvisories);
router.get('/next-actions',          getNextActions);
router.get('/executive-summary',     getExecutiveSummary);
router.get('/operational-summary',   getOperationalSummary);

export default router;
