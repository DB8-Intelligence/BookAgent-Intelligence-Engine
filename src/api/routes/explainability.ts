/**
 * Routes: Trust, Explanation & Audit Surfaces
 *
 * Parte 97: Trust, Explanation & Audit Surfaces
 */

import { Router } from 'express';
import {
  getDecisionExplanation,
  getJobExplanation,
  getPublicationExplanation,
  listExplanationsEndpoint,
  getEntityAudit,
  getCampaignAudit,
  getPublicationAudit,
  getTenantTrust,
  getEntityTrust,
} from '../controllers/explainabilityController.js';

const router = Router();

// Explanation
router.get('/decision/:id',       getDecisionExplanation);
router.get('/job/:id',            getJobExplanation);
router.get('/publication/:id',    getPublicationExplanation);
router.get('/list',               listExplanationsEndpoint);

// Audit
router.get('/audit/entity/:type/:id',   getEntityAudit);
router.get('/audit/campaign/:id',       getCampaignAudit);
router.get('/audit/publication/:id',    getPublicationAudit);

// Trust
router.get('/trust/tenant',            getTenantTrust);
router.get('/trust/entity/:type/:id',  getEntityTrust);

export default router;
