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
} from '../controllers/customerDashboardController.js';
import { getCustomerAnalytics } from '../controllers/analyticsController.js';

const router = Router();

router.get('/overview',      getDashboardOverview);
router.get('/jobs',          getDashboardJobs);
router.get('/jobs/:jobId',   getDashboardJobDetail);
router.get('/usage',         getDashboardUsage);
router.get('/billing',       getDashboardBilling);
router.get('/insights',      getDashboardInsights);
router.get('/analytics',     getCustomerAnalytics);

export default router;
