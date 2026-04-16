/**
 * Routes: Customer Dashboard
 *
 * Endpoints do dashboard do cliente — tenant-scoped via tenantGuard.
 *
 * GET /dashboard/overview              → Visão geral
 * GET /dashboard/jobs                  → Listagem de jobs
 * GET /dashboard/jobs/:jobId           → Detalhe de job
 * GET /dashboard/usage                 → Uso e limites
 * GET /dashboard/billing               → Plano e assinatura
 * GET /dashboard/insights              → Performance e recomendações
 * GET /dashboard/analytics             → Analytics do tenant (Parte 80)
 *
 * Parte 78: Customer Dashboard Backend
 * Parte 80: Reporting & Analytics
 */

import { Router } from 'express';
import {
  getDashboardOverview,
  getDashboardJobs,
  getDashboardJobDetail,
  getDashboardUsage,
  getDashboardBilling,
  getDashboardInsights,
  getDashboardPublications,
  getDashboardCampaigns,
} from '../controllers/customerDashboardController.js';
import { getCustomerAnalytics } from '../controllers/analyticsController.js';
import {
  approveJob,
  rejectJob,
  commentJob,
  publishJob,
  socialPublishJob,
  getJobPublications,
} from '../controllers/approvalController.js';

const router = Router();

// --- Read endpoints ---
router.get('/overview',         getDashboardOverview);
router.get('/jobs',             getDashboardJobs);
router.get('/jobs/:jobId',      getDashboardJobDetail);
router.get('/usage',            getDashboardUsage);
router.get('/billing',          getDashboardBilling);
router.get('/insights',         getDashboardInsights);
router.get('/analytics',        getCustomerAnalytics);
router.get('/publications',     getDashboardPublications);
router.get('/campaigns',        getDashboardCampaigns);

// --- Action endpoints (proxied from approval controller) ---
router.post('/jobs/:jobId/approve',        approveJob);
router.post('/jobs/:jobId/reject',         rejectJob);
router.post('/jobs/:jobId/comment',        commentJob);
router.post('/jobs/:jobId/publish',        publishJob);
router.post('/jobs/:jobId/social-publish', socialPublishJob);
router.get('/jobs/:jobId/publications',    getJobPublications);

export default router;
