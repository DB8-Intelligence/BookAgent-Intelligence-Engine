/**
 * Strategy Controller — Automated Strategy Layer
 *
 * GET  /strategy/overview          → Snapshot estratégico completo
 * GET  /strategy/recommendations   → Recomendações táticas
 * GET  /strategy/mix               → Mix de conteúdo
 * POST /strategy/generate          → Forçar re-geração
 *
 * Todos tenant-scoped via tenantGuard.
 *
 * Parte 84: Automated Strategy Layer
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { generateStrategy } from '../../modules/strategy/index.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForStrategy(client: SupabaseClientInstance): void {
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

export async function getStrategyOverview(req: Request, res: Response): Promise<void> {
  try {
    const snapshot = await generateStrategy(getTenantCtx(req), supabaseClient);
    sendSuccess(res, snapshot);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar estratégia', 500, err);
  }
}

export async function getStrategyRecommendations(req: Request, res: Response): Promise<void> {
  try {
    const snapshot = await generateStrategy(getTenantCtx(req), supabaseClient);
    sendSuccess(res, {
      recommendations: snapshot.strategy.recommendations,
      immediateActions: snapshot.immediateActions,
      total: snapshot.strategy.recommendations.length,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha', 500, err);
  }
}

export async function getStrategyMix(req: Request, res: Response): Promise<void> {
  try {
    const snapshot = await generateStrategy(getTenantCtx(req), supabaseClient);
    sendSuccess(res, {
      mix: snapshot.strategy.mix,
      intensity: snapshot.strategy.intensity,
      primaryObjective: snapshot.strategy.primaryObjective,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha', 500, err);
  }
}

export async function generateStrategyEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const snapshot = await generateStrategy(getTenantCtx(req), supabaseClient);
    sendSuccess(res, snapshot, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar estratégia', 500, err);
  }
}
