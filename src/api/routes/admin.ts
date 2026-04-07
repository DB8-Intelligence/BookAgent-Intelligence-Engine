/**
 * Routes: Admin / Ops Console
 *
 * Todos os endpoints protegidos por API key (authMiddleware).
 *
 * Consultas:
 *   GET  /admin/tenants              → Listar tenants
 *   GET  /admin/jobs                 → Listar jobs
 *   GET  /admin/jobs/failed          → Jobs com falha
 *   GET  /admin/publications         → Publicações
 *   GET  /admin/publications/failed  → Publicações falhas
 *   GET  /admin/billing              → Visão de billing
 *   GET  /admin/health               → System health
 *   GET  /admin/audit                → Audit trail
 *
 * Ações:
 *   POST /admin/actions              → Executar ação administrativa
 *
 * Parte 77: Admin / Ops Console Backend
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getAdminTenants,
  getAdminJobs,
  getAdminFailedJobs,
  getAdminPublications,
  getAdminFailedPublications,
  getAdminBilling,
  getAdminHealth,
  getAdminAudit,
  executeAction,
} from '../controllers/adminController.js';

const router = Router();

// All admin endpoints require API key
router.use(authMiddleware);

// Consultas
router.get('/tenants',              getAdminTenants);
router.get('/jobs',                 getAdminJobs);
router.get('/jobs/failed',          getAdminFailedJobs);
router.get('/publications',         getAdminPublications);
router.get('/publications/failed',  getAdminFailedPublications);
router.get('/billing',              getAdminBilling);
router.get('/health',               getAdminHealth);
router.get('/audit',                getAdminAudit);

// Ações
router.post('/actions',             executeAction);

export default router;
