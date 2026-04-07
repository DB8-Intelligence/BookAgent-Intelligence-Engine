/**
 * Routes: Recovery & Self-Healing
 *
 * Parte 91: Self-Healing Operations & Recovery
 */

import { Router } from 'express';
import {
  getStuckStates,
  reconcile,
  repairEntity,
  repairStuckStates,
  getRecoveryAudit,
  getRecoveryPolicies,
} from '../controllers/recoveryController.js';

const router = Router();

router.get('/stuck',             getStuckStates);
router.post('/reconcile',        reconcile);
router.post('/repair',           repairEntity);
router.post('/stuck/repair',     repairStuckStates);
router.get('/audit',             getRecoveryAudit);
router.get('/policies',          getRecoveryPolicies);

export default router;
