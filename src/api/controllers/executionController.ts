/**
 * Execution Controller — Autonomous Campaign Execution
 *
 * GET  /campaigns/:id/execution           → Última execução da campanha
 * GET  /campaigns/:id/execution/history    → Histórico de execuções
 * POST /campaigns/:id/execution/run        → Forçar ciclo de execução
 * GET  /campaigns/:id/execution/readiness  → Avaliar readiness
 * GET  /campaigns/:id/execution/blocked    → Itens bloqueados
 *
 * Todos tenant-scoped via tenantGuard.
 *
 * Parte 87: Autonomous Campaign Execution
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';
import { getCampaign } from '../../modules/campaigns/index.js';
import { getScheduleByCampaign } from '../../modules/scheduling/index.js';
import {
  executeCycle,
  listExecutions,
  getLatestExecution,
  checkAllReadiness,
} from '../../modules/campaign-execution/index.js';
import { ExecutionDecisionType } from '../../domain/entities/campaign-execution.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForExecution(client: SupabaseClientInstance): void {
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
 * GET /campaigns/:id/execution — Última execução
 */
export async function getExecution(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;

    const execution = await getLatestExecution(id!, tenantCtx.tenantId, supabaseClient);
    if (!execution) {
      sendError(res, 'NOT_FOUND', 'Nenhuma execução encontrada para esta campanha', 404);
      return;
    }

    sendSuccess(res, execution);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar execução', 500, err);
  }
}

/**
 * GET /campaigns/:id/execution/history — Histórico de execuções
 */
export async function getExecutionHistory(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;

    const executions = await listExecutions(id!, tenantCtx.tenantId, supabaseClient);

    sendSuccess(res, {
      executions,
      total: executions.length,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar histórico', 500, err);
  }
}

/**
 * POST /campaigns/:id/execution/run — Forçar ciclo de execução
 */
export async function runExecution(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;

    // Get campaign
    const campaign = await getCampaign(id!, tenantCtx.tenantId, supabaseClient);
    if (!campaign) {
      sendError(res, 'NOT_FOUND', 'Campanha não encontrada', 404);
      return;
    }

    // Get schedule
    const schedule = await getScheduleByCampaign(id!, tenantCtx.tenantId, supabaseClient);
    if (!schedule) {
      sendError(res, 'NOT_FOUND', 'Schedule não encontrado. Gere um schedule primeiro.', 404);
      return;
    }

    // Execute cycle
    const execution = await executeCycle(schedule, campaign, tenantCtx, supabaseClient);

    sendSuccess(res, execution, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao executar ciclo', 500, err);
  }
}

/**
 * GET /campaigns/:id/execution/readiness — Avaliar readiness sem executar
 */
export async function getReadiness(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;

    const campaign = await getCampaign(id!, tenantCtx.tenantId, supabaseClient);
    if (!campaign) {
      sendError(res, 'NOT_FOUND', 'Campanha não encontrada', 404);
      return;
    }

    const schedule = await getScheduleByCampaign(id!, tenantCtx.tenantId, supabaseClient);
    if (!schedule) {
      sendError(res, 'NOT_FOUND', 'Schedule não encontrado', 404);
      return;
    }

    const readinessResults = await checkAllReadiness(
      schedule,
      campaign,
      tenantCtx,
      supabaseClient,
    );

    const readyCount = readinessResults.filter((r) => r.ready).length;
    const blockedCount = readinessResults.filter((r) => !r.ready).length;

    sendSuccess(res, {
      campaignId: campaign.id,
      scheduleId: schedule.id,
      items: readinessResults,
      summary: {
        total: readinessResults.length,
        ready: readyCount,
        blocked: blockedCount,
      },
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao avaliar readiness', 500, err);
  }
}

/**
 * GET /campaigns/:id/execution/blocked — Itens bloqueados
 */
export async function getBlockedItems(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;

    // Try latest execution first
    const execution = await getLatestExecution(id!, tenantCtx.tenantId, supabaseClient);

    if (execution) {
      const blocked = execution.items.filter(
        (i) => i.decision.decision === ExecutionDecisionType.BLOCK ||
               i.decision.decision === ExecutionDecisionType.REQUIRE_INTERVENTION,
      );

      sendSuccess(res, {
        campaignId: id,
        executionId: execution.id,
        blockedItems: blocked.map((item) => ({
          scheduleItemId: item.scheduleItemId,
          campaignItemId: item.campaignItemId,
          title: item.title,
          decision: item.decision.decision,
          reason: item.decision.reason,
          blockReasons: item.readiness.blockReasons,
        })),
        total: blocked.length,
      });
      return;
    }

    // No execution yet — run readiness check
    const campaign = await getCampaign(id!, tenantCtx.tenantId, supabaseClient);
    const schedule = await getScheduleByCampaign(id!, tenantCtx.tenantId, supabaseClient);

    if (!campaign || !schedule) {
      sendSuccess(res, { campaignId: id, blockedItems: [], total: 0 });
      return;
    }

    const readiness = await checkAllReadiness(schedule, campaign, tenantCtx, supabaseClient);
    const blocked = readiness.filter((r) => !r.ready);

    sendSuccess(res, {
      campaignId: id,
      blockedItems: blocked.map((r) => ({
        scheduleItemId: r.scheduleItemId,
        campaignItemId: r.campaignItemId,
        title: r.title,
        blockReasons: r.blockReasons,
      })),
      total: blocked.length,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar itens bloqueados', 500, err);
  }
}
