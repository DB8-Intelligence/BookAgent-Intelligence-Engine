/**
 * Routes: Customer Insights & Recommendations
 *
 * Tenant-scoped via tenantGuard.
 *
 * Parte 82: Customer Insights & Recommendation
 */

import { Router } from 'express';
import {
  getInsightsOverview,
  getContentInsights,
  getPublishingInsights,
  getUsageInsights,
  getPerformanceInsights,
  getRecommendationsEndpoint,
} from '../controllers/insightsController.js';

const router = Router();

router.get('/overview',        getInsightsOverview);
router.get('/content',         getContentInsights);
router.get('/publishing',      getPublishingInsights);
router.get('/usage',           getUsageInsights);
router.get('/performance',     getPerformanceInsights);
router.get('/recommendations', getRecommendationsEndpoint);

export default router;
