/**
 * Routes: Decision Intelligence Layer
 *
 * Parte 94: Decision Intelligence Layer
 */

import { Router } from 'express';
import {
  requestDecision,
  getDecision,
  listDecisionsEndpoint,
  overrideDecisionEndpoint,
  getDecisionContext,
  getPendingDecisions,
} from '../controllers/decisionController.js';

const router = Router();

router.post('/make',              requestDecision);
router.get('/context',            getDecisionContext);
router.get('/pending',            getPendingDecisions);
router.post('/:id/override',     overrideDecisionEndpoint);
router.get('/:id',                getDecision);
router.get('/',                   listDecisionsEndpoint);

export default router;
