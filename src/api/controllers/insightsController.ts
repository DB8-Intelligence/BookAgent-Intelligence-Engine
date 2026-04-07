/**
 * Insights Controller — Customer Insights & Recommendation
 *
 * GET /insights/overview        → Snapshot completo
 * GET /insights/content         → Insights de conteúdo
 * GET /insights/publishing      → Insights de publicação
 * GET /insights/usage           → Insights de uso
 * GET /insights/performance     → Insights de performance
 * GET /insights/recommendations → Recomendações acionáveis
 *
 * Todos tenant-scoped via tenantGuard.
 *
 * Parte 82: Customer Insights & Recommendation
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import {
  getInsightSnapshot,
  getInsightsByCategory,
  getRecommendations,
} from '../../modules/insights/index.js';
import { InsightCategory } from '../../domain/entities/insight.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForInsights(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

// ============================================================================
// Helpers
// ============================================================================

function getTenantCtx(req: Request) {
  return req.tenantContext ?? createDefaultTenantContext();
}

// ============================================================================
// Endpoints
// ============================================================================

export async function getInsightsOverview(req: Request, res: Response): Promise<void> {
  try {
    const snapshot = await getInsightSnapshot(getTenantCtx(req), supabaseClient);
    sendSuccess(res, snapshot);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar insights', 500, err);
  }
}

export async function getContentInsights(req: Request, res: Response): Promise<void> {
  try {
    const insights = await getInsightsByCategory(getTenantCtx(req), InsightCategory.CONTENT, supabaseClient);
    sendSuccess(res, { insights, total: insights.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha', 500, err);
  }
}

export async function getPublishingInsights(req: Request, res: Response): Promise<void> {
  try {
    const insights = await getInsightsByCategory(getTenantCtx(req), InsightCategory.PUBLISHING, supabaseClient);
    sendSuccess(res, { insights, total: insights.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha', 500, err);
  }
}

export async function getUsageInsights(req: Request, res: Response): Promise<void> {
  try {
    const insights = await getInsightsByCategory(getTenantCtx(req), InsightCategory.USAGE, supabaseClient);
    sendSuccess(res, { insights, total: insights.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha', 500, err);
  }
}

export async function getPerformanceInsights(req: Request, res: Response): Promise<void> {
  try {
    const insights = await getInsightsByCategory(getTenantCtx(req), InsightCategory.PERFORMANCE, supabaseClient);
    sendSuccess(res, { insights, total: insights.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha', 500, err);
  }
}

export async function getRecommendationsEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const recommendations = await getRecommendations(getTenantCtx(req), supabaseClient);
    sendSuccess(res, { recommendations, total: recommendations.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha', 500, err);
  }
}
