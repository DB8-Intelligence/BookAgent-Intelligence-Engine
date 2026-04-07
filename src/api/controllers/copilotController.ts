/**
 * Co-Pilot Controller — Executive Co-Pilot / Operations Advisor
 *
 * GET /copilot/overview           → Overview completo
 * GET /copilot/advisories         → Advisories priorizados
 * GET /copilot/next-actions       → Next Best Actions
 * GET /copilot/executive-summary  → Executive summary
 * GET /copilot/operational-summary→ Operational summary
 *
 * Parte 95: Executive Co-Pilot / Operations Advisor
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';
import {
  generateOverview,
  generateBundle,
  generateExecutiveSummary,
  generateOperationalSummary,
} from '../../modules/copilot/index.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForCoPilot(client: SupabaseClientInstance): void {
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
 * GET /copilot/overview — Overview completo (exec + ops + bundle)
 */
export async function getOverview(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const global = req.query['global'] === 'true';
    const tenantId = global ? null : tenantCtx.tenantId;

    const overview = await generateOverview(tenantId, supabaseClient);
    sendSuccess(res, overview);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar overview', 500, err);
  }
}

/**
 * GET /copilot/advisories — Advisories priorizados
 */
export async function getAdvisories(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const global = req.query['global'] === 'true';
    const tenantId = global ? null : tenantCtx.tenantId;

    const bundle = await generateBundle(tenantId, supabaseClient);

    sendSuccess(res, {
      advisories: bundle.advisories,
      total: bundle.totalActive,
      critical: bundle.totalCritical,
      high: bundle.totalHigh,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar advisories', 500, err);
  }
}

/**
 * GET /copilot/next-actions — Next Best Actions
 */
export async function getNextActions(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const global = req.query['global'] === 'true';
    const tenantId = global ? null : tenantCtx.tenantId;

    const bundle = await generateBundle(tenantId, supabaseClient);

    sendSuccess(res, {
      nextBestActions: bundle.nextBestActions,
      total: bundle.nextBestActions.length,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar next actions', 500, err);
  }
}

/**
 * GET /copilot/executive-summary — Executive summary
 */
export async function getExecutiveSummary(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const global = req.query['global'] === 'true';
    const tenantId = global ? null : tenantCtx.tenantId;

    const summary = await generateExecutiveSummary(tenantId, supabaseClient);
    sendSuccess(res, summary);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar executive summary', 500, err);
  }
}

/**
 * GET /copilot/operational-summary — Operational summary
 */
export async function getOperationalSummary(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const global = req.query['global'] === 'true';
    const tenantId = global ? null : tenantCtx.tenantId;

    const summary = await generateOperationalSummary(tenantId, supabaseClient);
    sendSuccess(res, summary);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar operational summary', 500, err);
  }
}
