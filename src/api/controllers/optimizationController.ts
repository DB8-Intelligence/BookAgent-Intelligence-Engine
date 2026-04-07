/**
 * Optimization Controller — Goal-Driven Campaign Optimization
 *
 * GET  /campaigns/:id/optimization           → Última otimização
 * GET  /campaigns/:id/optimization/history    → Histórico de ciclos
 * POST /campaigns/:id/optimization/run        → Forçar ciclo de otimização
 * GET  /campaigns/:id/optimization/goals      → Goals da campanha
 * GET  /campaigns/:id/optimization/health     → Saúde da campanha
 *
 * Todos tenant-scoped via tenantGuard.
 *
 * Parte 89: Goal-Driven Campaign Optimization
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';
import { getCampaign } from '../../modules/campaigns/index.js';
import { getScheduleByCampaign } from '../../modules/scheduling/index.js';
import {
  runOptimizationCycle,
  getLatestOptimization,
  listOptimizationCycles,
  generateDefaultGoals,
} from '../../modules/campaign-optimization/index.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForOptimization(client: SupabaseClientInstance): void {
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
 * GET /campaigns/:id/optimization — Última otimização
 */
export async function getOptimization(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;

    const cycle = await getLatestOptimization(id!, tenantCtx.tenantId, supabaseClient);
    if (!cycle) {
      sendError(res, 'NOT_FOUND', 'Nenhuma otimização encontrada', 404);
      return;
    }

    sendSuccess(res, cycle);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar otimização', 500, err);
  }
}

/**
 * GET /campaigns/:id/optimization/history — Histórico de ciclos
 */
export async function getOptimizationHistory(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;

    const cycles = await listOptimizationCycles(id!, tenantCtx.tenantId, supabaseClient);

    sendSuccess(res, {
      cycles,
      total: cycles.length,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar histórico', 500, err);
  }
}

/**
 * POST /campaigns/:id/optimization/run — Forçar ciclo de otimização
 */
export async function runOptimization(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;

    const campaign = await getCampaign(id!, tenantCtx.tenantId, supabaseClient);
    if (!campaign) {
      sendError(res, 'NOT_FOUND', 'Campanha não encontrada', 404);
      return;
    }

    const schedule = await getScheduleByCampaign(id!, tenantCtx.tenantId, supabaseClient);

    // Get previous goals if available
    const prevCycle = await getLatestOptimization(id!, tenantCtx.tenantId, supabaseClient);
    const existingGoals = prevCycle?.goals ?? null;

    const cycle = await runOptimizationCycle(
      campaign,
      schedule,
      tenantCtx,
      existingGoals,
      supabaseClient,
    );

    sendSuccess(res, cycle, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao executar otimização', 500, err);
  }
}

/**
 * GET /campaigns/:id/optimization/goals — Goals da campanha
 */
export async function getCampaignGoals(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;

    // Try latest optimization
    const cycle = await getLatestOptimization(id!, tenantCtx.tenantId, supabaseClient);
    if (cycle) {
      sendSuccess(res, {
        goals: cycle.goals,
        overallHealth: cycle.overallHealth,
        evaluatedAt: cycle.evaluatedAt,
      });
      return;
    }

    // Generate default goals from campaign
    const campaign = await getCampaign(id!, tenantCtx.tenantId, supabaseClient);
    if (!campaign) {
      sendError(res, 'NOT_FOUND', 'Campanha não encontrada', 404);
      return;
    }

    const goals = generateDefaultGoals(campaign);
    sendSuccess(res, {
      goals,
      overallHealth: 'insufficient_data',
      evaluatedAt: null,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar goals', 500, err);
  }
}

/**
 * GET /campaigns/:id/optimization/health — Saúde resumida
 */
export async function getCampaignHealth(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;

    const cycle = await getLatestOptimization(id!, tenantCtx.tenantId, supabaseClient);

    if (!cycle) {
      sendSuccess(res, {
        campaignId: id,
        health: 'insufficient_data',
        recommendations: [],
        message: 'Execute um ciclo de otimização para avaliar a saúde da campanha',
      });
      return;
    }

    sendSuccess(res, {
      campaignId: id,
      health: cycle.overallHealth,
      summary: cycle.summary,
      goals: cycle.goals.map((g) => ({
        name: g.name,
        health: g.health,
        progressPercent: g.progressPercent,
        currentValue: g.currentValue,
        targetValue: g.targetValue,
      })),
      recommendations: cycle.recommendations.map((r) => ({
        action: r.action,
        title: r.title,
        impact: r.impact,
        confidence: r.confidence,
      })),
      evaluatedAt: cycle.evaluatedAt,
      nextEvaluationAt: cycle.nextEvaluationAt,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar saúde', 500, err);
  }
}
