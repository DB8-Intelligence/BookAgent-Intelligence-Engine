/**
 * Customer Dashboard Controller
 *
 * Endpoints do dashboard do cliente — todos tenant-scoped.
 *
 * GET /dashboard/overview              → Visão geral da conta
 * GET /dashboard/jobs                  → Listagem de jobs
 * GET /dashboard/jobs/:jobId           → Detalhe de job
 * GET /dashboard/usage                 → Uso e limites
 * GET /dashboard/billing               → Plano e assinatura
 * GET /dashboard/insights              → Performance e recomendações
 *
 * Parte 78: Customer Dashboard Backend
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import {
  // Legacy (Supabase) — ainda usado por /usage, /billing, /insights,
  // /publications, /campaigns enquanto esses módulos não migram
  getUsageView,
  getBillingView,
  getInsightsView,
  getPublicationsOverview,
  getCampaignsOverview,
} from '../../modules/customer-dashboard/index.js';
import {
  // Firestore-backed — primários para /overview, /jobs, /jobs/:id, /gallery
  getOverviewFromFirestore,
  getJobListFromFirestore,
  getJobDetailFromFirestore,
  getGalleryFromFirestore,
} from '../../modules/customer-dashboard/firestore-views.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForCustomerDashboard(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

// ============================================================================
// Helpers
// ============================================================================

function getTenantCtx(req: Request) {
  return req.tenantContext ?? createDefaultTenantContext();
}

// ============================================================================
// GET /dashboard/overview
// ============================================================================

export async function getDashboardOverview(req: Request, res: Response): Promise<void> {
  try {
    const overview = await getOverviewFromFirestore(getTenantCtx(req));
    sendSuccess(res, overview);
  } catch (err) {
    logger.error(`[customerDashboard] overview error: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar overview', 500, err);
  }
}

// ============================================================================
// GET /dashboard/jobs
// ============================================================================

export async function getDashboardJobs(req: Request, res: Response): Promise<void> {
  try {
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 100) : 20;
    const jobs = await getJobListFromFirestore(getTenantCtx(req), limit);
    sendSuccess(res, { jobs, total: jobs.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar jobs', 500, err);
  }
}

// ============================================================================
// GET /dashboard/jobs/:jobId
// ============================================================================

export async function getDashboardJobDetail(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  try {
    const detail = await getJobDetailFromFirestore(getTenantCtx(req), jobId);
    if (!detail) {
      sendError(res, 'NOT_FOUND', 'Job não encontrado', 404);
      return;
    }

    sendSuccess(res, detail);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar job', 500, err);
  }
}

// ============================================================================
// GET /dashboard/usage
// ============================================================================

export async function getDashboardUsage(req: Request, res: Response): Promise<void> {
  try {
    const usage = await getUsageView(getTenantCtx(req), supabaseClient);
    sendSuccess(res, usage);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar uso', 500, err);
  }
}

// ============================================================================
// GET /dashboard/billing
// ============================================================================

export async function getDashboardBilling(req: Request, res: Response): Promise<void> {
  try {
    const billing = await getBillingView(getTenantCtx(req), supabaseClient);
    sendSuccess(res, billing);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar billing', 500, err);
  }
}

// ============================================================================
// GET /dashboard/insights
// ============================================================================

export async function getDashboardInsights(req: Request, res: Response): Promise<void> {
  try {
    const insights = await getInsightsView(getTenantCtx(req), supabaseClient);
    sendSuccess(res, insights);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar insights', 500, err);
  }
}

// ============================================================================
// GET /dashboard/publications
// ============================================================================

export async function getDashboardPublications(req: Request, res: Response): Promise<void> {
  try {
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 100) : 50;
    const overview = await getPublicationsOverview(getTenantCtx(req), supabaseClient, limit);
    sendSuccess(res, overview);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar publicações', 500, err);
  }
}

// ============================================================================
// GET /dashboard/campaigns
// ============================================================================

export async function getDashboardCampaigns(req: Request, res: Response): Promise<void> {
  try {
    const campaigns = await getCampaignsOverview(getTenantCtx(req), supabaseClient);
    sendSuccess(res, campaigns);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar campanhas', 500, err);
  }
}

// ============================================================================
// GET /dashboard/gallery
// ============================================================================

export async function getDashboardGallery(req: Request, res: Response): Promise<void> {
  try {
    const items = await getGalleryFromFirestore(getTenantCtx(req), {
      type: typeof req.query.type === 'string' ? req.query.type : undefined,
      onlyWithDownload: req.query.onlyWithDownload === 'true',
      limit: req.query.limit ? Math.min(Number(req.query.limit), 200) : 50,
    });
    sendSuccess(res, { items, total: items.length });
  } catch (err) {
    logger.error(`[customerDashboard] gallery error: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar galeria', 500, err);
  }
}
