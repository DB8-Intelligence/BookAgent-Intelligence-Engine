/**
 * Analytics Controller — Reporting & Analytics
 *
 * Admin endpoints (globais, protegidos por authMiddleware):
 *   GET /analytics/overview
 *   GET /analytics/jobs
 *   GET /analytics/content
 *   GET /analytics/publications
 *   GET /analytics/tenants
 *   GET /analytics/billing
 *   GET /analytics/learning
 *
 * Customer endpoints (tenant-scoped, via tenantGuard):
 *   GET /dashboard/analytics → overview do próprio tenant
 *
 * Query params comuns: from, to, granularity (day|week|month)
 *
 * Parte 80: Reporting & Analytics
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import type { AnalyticsTimeFilter, AnalyticsGranularity } from '../../domain/entities/analytics.js';
import {
  defaultTimeFilter,
  getJobAnalytics,
  getContentAnalytics,
  getPublicationAnalytics,
  getTenantAnalytics,
  getBillingAnalytics,
  getLearningAnalytics,
  getAnalyticsDashboard,
} from '../../modules/analytics/index.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForAnalytics(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

// ============================================================================
// Helpers
// ============================================================================

function parseFilter(query: Request['query'], tenantId?: string): AnalyticsTimeFilter {
  const base = defaultTimeFilter(tenantId);
  return {
    from: typeof query.from === 'string' ? query.from : base.from,
    to: typeof query.to === 'string' ? query.to : base.to,
    granularity: (query.granularity as AnalyticsGranularity) ?? base.granularity,
    tenantId: typeof query.tenantId === 'string' ? query.tenantId : tenantId,
  };
}

// ============================================================================
// Admin Endpoints (global)
// ============================================================================

export async function getAnalyticsOverview(req: Request, res: Response): Promise<void> {
  try {
    const filter = parseFilter(req.query);
    const dashboard = await getAnalyticsDashboard(filter, supabaseClient);
    sendSuccess(res, dashboard);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar analytics', 500, err);
  }
}

export async function getAnalyticsJobs(req: Request, res: Response): Promise<void> {
  try {
    const filter = parseFilter(req.query);
    const data = await getJobAnalytics(filter, supabaseClient);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha', 500, err);
  }
}

export async function getAnalyticsContent(req: Request, res: Response): Promise<void> {
  try {
    const filter = parseFilter(req.query);
    const data = await getContentAnalytics(filter, supabaseClient);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha', 500, err);
  }
}

export async function getAnalyticsPublications(req: Request, res: Response): Promise<void> {
  try {
    const filter = parseFilter(req.query);
    const data = await getPublicationAnalytics(filter, supabaseClient);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha', 500, err);
  }
}

export async function getAnalyticsTenants(req: Request, res: Response): Promise<void> {
  try {
    const filter = parseFilter(req.query);
    const data = await getTenantAnalytics(filter, supabaseClient);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha', 500, err);
  }
}

export async function getAnalyticsBilling(req: Request, res: Response): Promise<void> {
  try {
    const filter = parseFilter(req.query);
    const data = await getBillingAnalytics(filter, supabaseClient);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha', 500, err);
  }
}

export async function getAnalyticsLearning(req: Request, res: Response): Promise<void> {
  try {
    const filter = parseFilter(req.query);
    const data = await getLearningAnalytics(filter, supabaseClient);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha', 500, err);
  }
}

// ============================================================================
// Customer Endpoint (tenant-scoped)
// ============================================================================

export async function getCustomerAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = req.tenantContext ?? createDefaultTenantContext();
    const filter = parseFilter(req.query, tenantCtx.tenantId);

    const [jobs, publications] = await Promise.all([
      getJobAnalytics(filter, supabaseClient),
      getPublicationAnalytics(filter, supabaseClient),
    ]);

    sendSuccess(res, {
      period: { from: filter.from, to: filter.to },
      granularity: filter.granularity,
      jobs: {
        total: jobs.totalJobs,
        successRate: jobs.successRate,
        throughput: jobs.throughputSeries,
      },
      publications: {
        total: publications.totalAttempted,
        successRate: publications.successRate,
        byPlatform: publications.byPlatform,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar analytics', 500, err);
  }
}
