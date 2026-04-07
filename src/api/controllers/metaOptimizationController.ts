/**
 * Meta-Optimization Controller — Continuous Improvement Loop
 *
 * POST /optimization/meta/run      → Executar ciclo de melhoria
 * GET  /optimization/meta/insights → Insights do último ciclo
 * GET  /optimization/meta/history  → Histórico de ciclos
 * GET  /optimization/meta/latest   → Último ciclo completo
 *
 * Parte 99: Continuous Improvement Loop / Meta-Optimization
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';
import {
  runImprovementCycle,
  loadLatestCycle,
  listCycles,
} from '../../modules/meta-optimization/index.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForMetaOptimization(client: SupabaseClientInstance): void {
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

/**
 * POST /optimization/meta/run — Executar ciclo de melhoria
 */
export async function runCycle(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const cycle = await runImprovementCycle(tenantCtx.tenantId, supabaseClient);
    sendSuccess(res, cycle, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao executar ciclo de melhoria', 500, err);
  }
}

/**
 * GET /optimization/meta/insights — Insights do último ciclo
 */
export async function getInsights(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const cycle = await loadLatestCycle(tenantCtx.tenantId, supabaseClient);

    if (!cycle) {
      sendSuccess(res, {
        insights: [],
        actions: [],
        message: 'No improvement cycle found — run one first',
      });
      return;
    }

    sendSuccess(res, {
      insights: cycle.insights,
      actions: cycle.actions,
      healthIndicators: cycle.healthIndicators,
      overallScore: cycle.overallScore,
      scoreDelta: cycle.scoreDelta,
      summary: cycle.summary,
      cycleId: cycle.id,
      completedAt: cycle.completedAt,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar insights', 500, err);
  }
}

/**
 * GET /optimization/meta/history — Histórico de ciclos
 */
export async function getHistory(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const global = req.query['global'] === 'true';
    const tenantId = global ? null : tenantCtx.tenantId;
    const limit = req.query['limit'] ? Number(req.query['limit']) : 20;

    const cycles = await listCycles(tenantId, supabaseClient, limit);

    sendSuccess(res, {
      cycles: cycles.map((c) => ({
        id: c.id,
        status: c.status,
        overallScore: c.overallScore,
        scoreDelta: c.scoreDelta,
        insightCount: c.insights.length,
        actionCount: c.actions.length,
        summary: c.summary,
        startedAt: c.startedAt,
        completedAt: c.completedAt,
        durationMs: c.durationMs,
      })),
      total: cycles.length,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar histórico', 500, err);
  }
}

/**
 * GET /optimization/meta/latest — Último ciclo completo
 */
export async function getLatest(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const cycle = await loadLatestCycle(tenantCtx.tenantId, supabaseClient);

    if (!cycle) {
      sendError(res, 'NOT_FOUND', 'Nenhum ciclo encontrado', 404);
      return;
    }

    sendSuccess(res, cycle);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar último ciclo', 500, err);
  }
}
