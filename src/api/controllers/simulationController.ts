/**
 * Simulation Controller — Simulation & What-If Engine
 *
 * POST /simulation/run             → Executar simulação what-if
 * GET  /simulation/:id             → Detalhe de uma simulação
 * GET  /simulation                 → Listar simulações do tenant
 * POST /simulation/compare         → Comparar dois cenários específicos
 * GET  /simulation/recommendations → Recomendações recentes
 *
 * Parte 93: Simulation & What-If Engine
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';
import {
  buildBaseline,
  buildAlternative,
  parseChanges,
  runSimulation,
  loadSimulation,
  listSimulations,
} from '../../modules/simulation/index.js';
import type { RawChange } from '../../modules/simulation/index.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForSimulation(client: SupabaseClientInstance): void {
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
 * POST /simulation/run — Executar simulação what-if
 *
 * Body:
 *   name?: string
 *   description?: string
 *   changes: Array<{ axis: string, toValue: string|number|boolean, rationale?: string }>
 */
export async function runSim(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { name, description, changes } = req.body as {
      name?: string;
      description?: string;
      changes?: RawChange[];
    };

    if (!changes || !Array.isArray(changes) || changes.length === 0) {
      sendError(res, 'INVALID_INPUT', 'At least one change is required in the "changes" array', 400);
      return;
    }

    // Build baseline from current tenant state
    const baseline = await buildBaseline(tenantCtx.tenantId, supabaseClient);

    // Parse and validate changes
    const parsedChanges = parseChanges(changes, baseline);

    if (parsedChanges.length === 0) {
      sendError(res, 'INVALID_INPUT', 'No valid changes after validation — check axis values', 400);
      return;
    }

    // Build alternative scenario
    const alternative = buildAlternative(baseline, parsedChanges, name, description);

    // Run simulation
    const result = await runSimulation(
      tenantCtx.tenantId,
      baseline,
      [alternative],
      supabaseClient,
    );

    sendSuccess(res, result, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao executar simulação', 500, err);
  }
}

/**
 * GET /simulation/:id — Detalhe de uma simulação
 */
export async function getSimulation(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await loadSimulation(id, supabaseClient);

    if (!result) {
      sendError(res, 'NOT_FOUND', 'Simulação não encontrada', 404);
      return;
    }

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar simulação', 500, err);
  }
}

/**
 * GET /simulation — Listar simulações do tenant
 */
export async function listSims(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const global = req.query['global'] === 'true';
    const tenantId = global ? null : tenantCtx.tenantId;
    const limit = req.query['limit'] ? Number(req.query['limit']) : 20;

    const results = await listSimulations(tenantId, supabaseClient, limit);

    sendSuccess(res, { simulations: results, total: results.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar simulações', 500, err);
  }
}

/**
 * POST /simulation/compare — Comparar múltiplos cenários
 *
 * Body:
 *   scenarios: Array<{
 *     name?: string;
 *     description?: string;
 *     changes: Array<{ axis: string, toValue: string|number|boolean, rationale?: string }>
 *   }>
 */
export async function compareScenarios(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { scenarios } = req.body as {
      scenarios?: Array<{
        name?: string;
        description?: string;
        changes?: RawChange[];
      }>;
    };

    if (!scenarios || !Array.isArray(scenarios) || scenarios.length === 0) {
      sendError(res, 'INVALID_INPUT', 'At least one scenario is required', 400);
      return;
    }

    // Build baseline
    const baseline = await buildBaseline(tenantCtx.tenantId, supabaseClient);

    // Build alternatives
    const alternatives = scenarios
      .filter((s) => s.changes && s.changes.length > 0)
      .map((s) => {
        const parsed = parseChanges(s.changes!, baseline);
        return buildAlternative(baseline, parsed, s.name, s.description);
      });

    if (alternatives.length === 0) {
      sendError(res, 'INVALID_INPUT', 'No valid scenarios after validation', 400);
      return;
    }

    // Run simulation with multiple alternatives
    const result = await runSimulation(
      tenantCtx.tenantId,
      baseline,
      alternatives,
      supabaseClient,
    );

    sendSuccess(res, result, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao comparar cenários', 500, err);
  }
}

/**
 * GET /simulation/recommendations — Recomendações da simulação mais recente
 */
export async function getRecommendations(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const results = await listSimulations(tenantCtx.tenantId, supabaseClient, 1);

    if (results.length === 0) {
      sendSuccess(res, {
        recommendations: [],
        total: 0,
        message: 'No simulations found — run a simulation first',
      });
      return;
    }

    const latest = results[0];
    sendSuccess(res, {
      recommendations: latest.recommendations,
      total: latest.recommendations.length,
      simulationId: latest.id,
      generatedAt: latest.completedAt,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar recomendações', 500, err);
  }
}
