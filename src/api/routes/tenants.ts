/**
 * Routes: Tenant Management + Onboarding
 *
 * Parte 101: SaaS Multi-Tenant + Billing Real
 */

import { Router } from 'express';
import {
  createTenantEndpoint,
  getTenantEndpoint,
  listTenantsEndpoint,
  updateStatusEndpoint,
  updatePlanEndpoint,
  addMemberEndpoint,
  getContextEndpoint,
  listPlansEndpoint,
} from '../controllers/tenantController.js';

const router = Router();

router.post('/',                  createTenantEndpoint);
router.get('/',                   listTenantsEndpoint);
router.get('/:id',                getTenantEndpoint);
router.patch('/:id/status',      updateStatusEndpoint);
router.patch('/:id/plan',        updatePlanEndpoint);
router.post('/:id/members',     addMemberEndpoint);
router.get('/:id/context',       getContextEndpoint);

// Plan listing (separate prefix in index.ts: /plans)
export const planRouter = Router();
planRouter.get('/', listPlansEndpoint);

export default router;
