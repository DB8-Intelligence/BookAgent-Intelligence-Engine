/**
 * Acquisition Controller — Aquisição Automatizada & Growth
 *
 * POST   /api/v1/acquisition/campaigns          → Criar campanha
 * GET    /api/v1/acquisition/campaigns          → Listar campanhas
 * POST   /api/v1/acquisition/schedules          → Agendar conteúdo
 * GET    /api/v1/acquisition/schedules          → Listar agendamentos
 * POST   /api/v1/acquisition/sequences          → Criar sequência nurturing
 * GET    /api/v1/acquisition/sequences          → Listar sequências
 * POST   /api/v1/acquisition/conversions        → Registrar conversão
 * GET    /api/v1/acquisition/conversions        → Listar conversões
 * GET    /api/v1/acquisition/growth-dashboard    → Dashboard de crescimento
 *
 * Parte 103: Escala — Aquisição
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import {
  createCampaign,
  listCampaigns,
  scheduleContent,
  listScheduledContent,
  createNurturingSequence,
  listNurturingSequences,
  trackConversion,
  listConversions,
  getGrowthMetrics,
} from '../../modules/acquisition/index.js';
import type { CampaignGoalType, ConversionType } from '../../domain/entities/acquisition.js';

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForAcquisition(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

function getTenantId(req: Request): string {
  const ctx = (req as unknown as Record<string, unknown>)['tenantContext'] as
    | { tenantId: string }
    | undefined;
  return ctx?.tenantId ?? 'default';
}

// Campaigns
export async function handleCreateCampaign(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const { name, goal, channels, channelConfig, startsAt, endsAt } = req.body as Record<string, unknown>;

    if (!name || !goal) {
      sendError(res, 'INVALID_INPUT', 'name and goal are required', 400);
      return;
    }

    const campaign = await createCampaign({
      tenantId,
      name: name as string,
      goal: goal as CampaignGoalType,
      channels: (channels as string[]) ?? [],
      channelConfig: channelConfig as Record<string, unknown>,
      startsAt: startsAt as string,
      endsAt: endsAt as string,
    }, supabaseClient);

    sendSuccess(res, campaign, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to create campaign', 500, err);
  }
}

export async function handleListCampaigns(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const campaigns = await listCampaigns(tenantId, supabaseClient);
    sendSuccess(res, { campaigns, total: campaigns.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to list campaigns', 500, err);
  }
}

// Schedules
export async function handleScheduleContent(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const { jobId, artifactId, platform, scheduledAt, campaignId } = req.body as Record<string, unknown>;

    if (!jobId || !artifactId || !platform || !scheduledAt) {
      sendError(res, 'INVALID_INPUT', 'jobId, artifactId, platform, and scheduledAt are required', 400);
      return;
    }

    const schedule = await scheduleContent(
      tenantId, jobId as string, artifactId as string,
      platform as string, scheduledAt as string,
      (campaignId as string) ?? null, supabaseClient,
    );

    sendSuccess(res, schedule, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to schedule content', 500, err);
  }
}

export async function handleListSchedules(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const schedules = await listScheduledContent(tenantId, supabaseClient);
    sendSuccess(res, { schedules, total: schedules.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to list schedules', 500, err);
  }
}

// Nurturing
export async function handleCreateSequence(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const { name, triggerEvent } = req.body as Record<string, unknown>;

    if (!name || !triggerEvent) {
      sendError(res, 'INVALID_INPUT', 'name and triggerEvent are required', 400);
      return;
    }

    const sequence = await createNurturingSequence(
      tenantId, name as string, triggerEvent as string, supabaseClient,
    );

    sendSuccess(res, sequence, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to create sequence', 500, err);
  }
}

export async function handleListSequences(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const sequences = await listNurturingSequences(tenantId, supabaseClient);
    sendSuccess(res, { sequences, total: sequences.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to list sequences', 500, err);
  }
}

// Conversions
export async function handleTrackConversion(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const { type, channel, planTier, revenueBrl, leadPhone, campaignId, referralCode } = req.body as Record<string, unknown>;

    if (!type || !channel || !planTier) {
      sendError(res, 'INVALID_INPUT', 'type, channel, and planTier are required', 400);
      return;
    }

    const event = await trackConversion(
      tenantId, type as ConversionType, channel as string,
      planTier as string, (revenueBrl as number) ?? 0,
      { leadPhone: leadPhone as string, campaignId: campaignId as string, referralCode: referralCode as string },
      supabaseClient,
    );

    sendSuccess(res, event, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to track conversion', 500, err);
  }
}

export async function handleListConversions(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const conversions = await listConversions(tenantId, supabaseClient);
    sendSuccess(res, { conversions, total: conversions.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to list conversions', 500, err);
  }
}

// Growth Dashboard
export async function handleGrowthDashboard(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const dashboard = await getGrowthMetrics(tenantId, supabaseClient);
    sendSuccess(res, dashboard);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to get growth dashboard', 500, err);
  }
}
