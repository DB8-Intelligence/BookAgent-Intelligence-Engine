/**
 * Goal Optimization Controller — Goal-Driven Optimization
 *
 * GET  /goals/profile             → Profile ativo do tenant
 * GET  /goals/evaluate            → Avaliação goal-driven completa
 * GET  /goals/profiles            → Listar profiles disponíveis
 * POST /goals/preference          → Definir preferência do tenant
 * GET  /goals/preference          → Consultar preferência
 * GET  /goals/params              → Parâmetros derivados
 *
 * Todos tenant-scoped via tenantGuard.
 *
 * Parte 89: Goal-Driven Optimization
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';
import {
  resolveProfile,
  deriveParams,
  saveTenantPreference,
  getTenantPreference,
  evaluateGoals,
} from '../../modules/goal-optimization/index.js';
import {
  OptimizationObjective,
  OptimizationAggressiveness,
  PRESET_PROFILES,
  OBJECTIVE_OPT_LABELS,
} from '../../domain/entities/goal-optimization.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForGoals(client: SupabaseClientInstance): void {
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
 * GET /goals/profile — Profile ativo do tenant
 */
export async function getActiveProfile(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const profile = await resolveProfile(tenantCtx, supabaseClient);
    sendSuccess(res, profile);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao resolver profile', 500, err);
  }
}

/**
 * GET /goals/evaluate — Avaliação goal-driven completa
 */
export async function evaluateGoalsDriven(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const result = await evaluateGoals(tenantCtx, supabaseClient);
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao avaliar goals', 500, err);
  }
}

/**
 * GET /goals/profiles — Listar todos os profiles disponíveis
 */
export async function listProfiles(_req: Request, res: Response): Promise<void> {
  try {
    const profiles = Object.values(PRESET_PROFILES).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      primaryObjective: p.primaryObjective,
      secondaryObjective: p.secondaryObjective,
      aggressiveness: p.aggressiveness,
      constraintCount: p.constraints.filter((c) => c.enabled).length,
      tradeOffCount: p.tradeOffs.length,
    }));

    sendSuccess(res, {
      profiles,
      total: profiles.length,
      objectives: Object.entries(OBJECTIVE_OPT_LABELS).map(([key, label]) => ({ key, label })),
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar profiles', 500, err);
  }
}

/**
 * POST /goals/preference — Definir preferência do tenant
 */
export async function setPreference(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const body = req.body as {
      primaryObjective?: string;
      aggressiveness?: string;
      customConstraints?: Array<Record<string, unknown>>;
    };

    if (!body.primaryObjective ||
        !Object.values(OptimizationObjective).includes(body.primaryObjective as OptimizationObjective)) {
      sendError(res, 'INVALID_INPUT', 'primaryObjective inválido', 400);
      return;
    }

    const objective = body.primaryObjective as OptimizationObjective;
    const profile = PRESET_PROFILES[objective];

    const aggressiveness = body.aggressiveness &&
      Object.values(OptimizationAggressiveness).includes(body.aggressiveness as OptimizationAggressiveness)
      ? (body.aggressiveness as OptimizationAggressiveness)
      : profile.aggressiveness;

    await saveTenantPreference({
      tenantId: tenantCtx.tenantId,
      activeProfileId: profile.id,
      primaryObjective: objective,
      customConstraints: (body.customConstraints ?? []) as unknown as Parameters<typeof saveTenantPreference>[0]['customConstraints'],
      tradeOffOverrides: [],
      aggressiveness,
      updatedAt: new Date().toISOString(),
    }, supabaseClient);

    // Return the evaluated result
    const result = await evaluateGoals(tenantCtx, supabaseClient);
    sendSuccess(res, result, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao definir preferência', 500, err);
  }
}

/**
 * GET /goals/preference — Consultar preferência do tenant
 */
export async function getPreference(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const pref = await getTenantPreference(tenantCtx.tenantId, supabaseClient);

    if (!pref) {
      sendSuccess(res, {
        preference: null,
        message: 'Nenhuma preferência definida. Usando default do plano.',
      });
      return;
    }

    sendSuccess(res, { preference: pref });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar preferência', 500, err);
  }
}

/**
 * GET /goals/params — Parâmetros derivados do goal ativo
 */
export async function getDerivedParams(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const profile = await resolveProfile(tenantCtx, supabaseClient);
    const params = deriveParams(profile, tenantCtx);

    sendSuccess(res, {
      profile: { id: profile.id, name: profile.name, objective: profile.primaryObjective },
      params,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao derivar parâmetros', 500, err);
  }
}
