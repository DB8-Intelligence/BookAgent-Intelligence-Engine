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
  getOverview,
  getJobList,
  getJobDetail,
  getUsageView,
  getBillingView,
  getInsightsView,
} from '../../modules/customer-dashboard/index.js';
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
    const overview = await getOverview(getTenantCtx(req), supabaseClient);
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
    const jobs = await getJobList(getTenantCtx(req), supabaseClient, limit);
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
    const detail = await getJobDetail(getTenantCtx(req), jobId, supabaseClient);
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
