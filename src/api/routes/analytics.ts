/**
 * Routes: Analytics (Admin — protegido por authMiddleware)
 *
 * GET /analytics/overview      → Dashboard consolidado
 * GET /analytics/jobs           → Job analytics
 * GET /analytics/content        → Content analytics
 * GET /analytics/publications   → Publication analytics
 * GET /analytics/tenants        → Tenant analytics
 * GET /analytics/billing        → Billing analytics
 * GET /analytics/learning       → Learning analytics
 *
 * Query params: from, to, granularity (day|week|month), tenantId
 *
 * Parte 80: Reporting & Analytics
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getAnalyticsOverview,
  getAnalyticsJobs,
  getAnalyticsContent,
  getAnalyticsPublications,
  getAnalyticsTenants,
  getAnalyticsBilling,
  getAnalyticsLearning,
} from '../controllers/analyticsController.js';

const router = Router();

router.use(authMiddleware);

router.get('/overview',      getAnalyticsOverview);
router.get('/jobs',          getAnalyticsJobs);
router.get('/content',       getAnalyticsContent);
router.get('/publications',  getAnalyticsPublications);
router.get('/tenants',       getAnalyticsTenants);
router.get('/billing',       getAnalyticsBilling);
router.get('/learning',      getAnalyticsLearning);

export default router;
