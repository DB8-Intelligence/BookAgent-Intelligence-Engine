/**
 * Schedule Controller — Scheduling & Calendar Orchestration
 *
 * GET  /campaigns/:id/schedule          → Schedule da campanha
 * POST /campaigns/:id/schedule/generate → Gerar schedule
 * POST /campaigns/:id/schedule/replan   → Replanejamento
 * PATCH /campaigns/:id/schedule/items/:itemId → Ação em item (confirm, execute, skip, fail)
 * GET  /calendar/overview               → Visão geral do calendário
 *
 * Todos tenant-scoped via tenantGuard.
 *
 * Parte 86: Scheduling & Calendar Orchestration
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';
import { getCampaign, listCampaigns } from '../../modules/campaigns/index.js';
import {
  generateSchedule,
  buildCalendarOverview,
  saveSchedule,
  getScheduleByCampaign,
  listSchedules,
  confirmItem,
  markExecuted,
  markFailed,
  skipItem,
  evaluateDependencies,
  replanSchedule,
} from '../../modules/scheduling/index.js';
import { AdjustmentReason } from '../../domain/entities/schedule.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForScheduling(client: SupabaseClientInstance): void {
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
 * GET /campaigns/:id/schedule — Schedule da campanha
 */
export async function getCampaignSchedule(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;

    const schedule = await getScheduleByCampaign(id!, tenantCtx.tenantId, supabaseClient);
    if (!schedule) {
      sendError(res, 'NOT_FOUND', 'Schedule não encontrado para esta campanha', 404);
      return;
    }

    // Evaluate dependencies on read
    evaluateDependencies(schedule);

    sendSuccess(res, schedule);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar schedule', 500, err);
  }
}

/**
 * POST /campaigns/:id/schedule/generate — Gerar schedule a partir de campanha
 */
export async function generateCampaignSchedule(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;
    const { startDate, cadence } = req.body as {
      startDate?: string;
      cadence?: Record<string, unknown>;
    };

    const campaign = await getCampaign(id!, tenantCtx.tenantId, supabaseClient);
    if (!campaign) {
      sendError(res, 'NOT_FOUND', 'Campanha não encontrada', 404);
      return;
    }

    const start = startDate ?? new Date().toISOString().slice(0, 10);

    const schedule = generateSchedule(
      campaign,
      start,
      tenantCtx,
      cadence as Record<string, unknown> | undefined,
    );

    await saveSchedule(schedule, supabaseClient);

    sendSuccess(res, schedule, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar schedule', 500, err);
  }
}

/**
 * POST /campaigns/:id/schedule/replan — Replanejamento do schedule
 */
export async function replanCampaignSchedule(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;
    const { shiftDays, reason, description } = req.body as {
      shiftDays?: number;
      reason?: string;
      description?: string;
    };

    if (!shiftDays || shiftDays < 1) {
      sendError(res, 'INVALID_INPUT', 'shiftDays deve ser >= 1', 400);
      return;
    }

    const schedule = await getScheduleByCampaign(id!, tenantCtx.tenantId, supabaseClient);
    if (!schedule) {
      sendError(res, 'NOT_FOUND', 'Schedule não encontrado', 404);
      return;
    }

    const adjustReason = Object.values(AdjustmentReason).includes(reason as AdjustmentReason)
      ? (reason as AdjustmentReason)
      : AdjustmentReason.MANUAL_RESCHEDULE;

    replanSchedule(
      schedule,
      shiftDays,
      adjustReason,
      description ?? `Replanejamento de ${shiftDays} dia(s)`,
    );

    await saveSchedule(schedule, supabaseClient);

    sendSuccess(res, schedule);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao replanejamento', 500, err);
  }
}

/**
 * PATCH /campaigns/:id/schedule/items/:itemId — Ação em item do schedule
 * Body: { action: 'confirm' | 'execute' | 'skip' | 'fail' }
 */
export async function updateScheduleItem(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id, itemId } = req.params;
    const { action } = req.body as { action?: string };

    const schedule = await getScheduleByCampaign(id!, tenantCtx.tenantId, supabaseClient);
    if (!schedule) {
      sendError(res, 'NOT_FOUND', 'Schedule não encontrado', 404);
      return;
    }

    let ok = false;
    switch (action) {
      case 'confirm':
        ok = confirmItem(schedule, itemId!);
        break;
      case 'execute':
        ok = markExecuted(schedule, itemId!);
        break;
      case 'skip':
        ok = skipItem(schedule, itemId!);
        break;
      case 'fail':
        ok = markFailed(schedule, itemId!);
        break;
      default:
        sendError(res, 'INVALID_ACTION', 'Ação inválida. Use: confirm, execute, skip, fail', 400);
        return;
    }

    if (!ok) {
      sendError(res, 'INVALID_TRANSITION', 'Ação não permitida para o status atual do item', 400);
      return;
    }

    await saveSchedule(schedule, supabaseClient);
    sendSuccess(res, schedule);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao atualizar item', 500, err);
  }
}

/**
 * GET /calendar/overview — Visão geral do calendário do tenant
 * Query params: start (YYYY-MM-DD), end (YYYY-MM-DD)
 */
export async function getCalendarOverview(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const startParam = req.query['start'] as string | undefined;
    const endParam = req.query['end'] as string | undefined;

    // Default: next 30 days
    const now = new Date();
    const periodStart = startParam ?? now.toISOString().slice(0, 10);
    const periodEnd = endParam ?? new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

    // Get all schedules for tenant
    const schedules = await listSchedules(tenantCtx.tenantId, supabaseClient);

    // Get campaign names for labels
    const campaigns = await listCampaigns(tenantCtx.tenantId, supabaseClient);
    const campaignNameMap = new Map(campaigns.map((c) => [c.id, c.name]));

    const schedulesWithNames = schedules.map((schedule) => ({
      schedule,
      campaignName: campaignNameMap.get(schedule.campaignId) ?? 'Campanha',
    }));

    const overview = buildCalendarOverview(
      tenantCtx.tenantId,
      schedulesWithNames,
      periodStart,
      periodEnd,
    );

    sendSuccess(res, overview);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar visão de calendário', 500, err);
  }
}
