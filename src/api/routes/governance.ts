/**
 * Routes: Governance
 *
 * Parte 88: Human-in-the-Loop Governance
 */

import { Router } from 'express';
import {
  getGovernancePolicy,
  listGovernanceCheckpoints,
  listPendingCheckpoints,
  getGovernanceCheckpoint,
  approveCheckpoint,
  rejectCheckpoint,
  overrideCheckpoint,
} from '../controllers/governanceController.js';

const router = Router();

router.get('/policy',                         getGovernancePolicy);
router.get('/checkpoints',                    listGovernanceCheckpoints);
router.get('/checkpoints/pending',            listPendingCheckpoints);
router.get('/checkpoints/:id',                getGovernanceCheckpoint);
router.post('/checkpoints/:id/approve',       approveCheckpoint);
router.post('/checkpoints/:id/reject',        rejectCheckpoint);
router.post('/checkpoints/:id/override',      overrideCheckpoint);

export default router;
