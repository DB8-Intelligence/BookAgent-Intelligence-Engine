/**
 * Distribution Controller — Canais, White-Label, Payouts, API Pricing
 *
 * POST   /api/v1/distribution/channels         → Criar canal
 * GET    /api/v1/distribution/channels         → Listar canais
 * GET    /api/v1/distribution/overview         → Dashboard de distribuição
 * POST   /api/v1/distribution/white-label      → Criar config white-label
 * GET    /api/v1/distribution/white-label/:partnerId → Config do parceiro
 * POST   /api/v1/distribution/payouts          → Criar payout
 * GET    /api/v1/distribution/payouts/:partnerId → Listar payouts
 * PATCH  /api/v1/distribution/payouts/:id/approve → Aprovar payout
 * GET    /api/v1/distribution/api-pricing      → Tabela de preços API
 * GET    /api/v1/distribution/api-invoices     → Listar invoices API
 *
 * Parte 103: Escala — Distribuição & Monetização
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import {
  createDistributionChannel,
  listDistributionChannels,
  getDistributionOverview,
  createWhiteLabelConfig,
  getWhiteLabelConfig,
  createPayout,
  listPayouts,
  approvePayout,
  listApiInvoices,
  getApiPricing,
} from '../../modules/distribution/index.js';
import type { DistributionChannelType, MonetizationModel } from '../../domain/entities/distribution.js';

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForDistribution(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

function getTenantId(req: Request): string {
  const ctx = (req as unknown as Record<string, unknown>)['tenantContext'] as
    | { tenantId: string }
    | undefined;
  return ctx?.tenantId ?? 'default';
}

// Channels
export async function handleCreateChannel(req: Request, res: Response): Promise<void> {
  try {
    const { type, name, model, config } = req.body as Record<string, unknown>;
    if (!type || !name || !model) {
      sendError(res, 'INVALID_INPUT', 'type, name, and model are required', 400);
      return;
    }
    const channel = await createDistributionChannel(
      type as DistributionChannelType, name as string,
      model as MonetizationModel, (config as Record<string, unknown>) ?? {},
      supabaseClient,
    );
    sendSuccess(res, channel, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to create channel', 500, err);
  }
}

export async function handleListChannels(_req: Request, res: Response): Promise<void> {
  try {
    const channels = await listDistributionChannels(supabaseClient);
    sendSuccess(res, { channels, total: channels.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to list channels', 500, err);
  }
}

export async function handleDistributionOverview(_req: Request, res: Response): Promise<void> {
  try {
    const overview = await getDistributionOverview(supabaseClient);
    sendSuccess(res, overview);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to get overview', 500, err);
  }
}

// White-Label
export async function handleCreateWhiteLabel(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const { partnerId, branding, customDomain, allowedPlans, maxEndCustomers } = req.body as Record<string, unknown>;

    if (!partnerId || !branding) {
      sendError(res, 'INVALID_INPUT', 'partnerId and branding are required', 400);
      return;
    }

    const config = await createWhiteLabelConfig(
      partnerId as string, tenantId, branding as never,
      (customDomain as string) ?? null,
      (allowedPlans as string[]) ?? ['basic', 'pro'],
      (maxEndCustomers as number) ?? 50,
      supabaseClient,
    );

    sendSuccess(res, config, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to create white-label config', 500, err);
  }
}

export async function handleGetWhiteLabel(req: Request, res: Response): Promise<void> {
  try {
    const { partnerId } = req.params;
    const config = await getWhiteLabelConfig(partnerId, supabaseClient);

    if (!config) {
      sendError(res, 'NOT_FOUND', 'White-label config not found', 404);
      return;
    }

    sendSuccess(res, config);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to get white-label config', 500, err);
  }
}

// Payouts
export async function handleCreatePayout(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const { partnerId, amountBrl, periodStart, periodEnd, referralId } = req.body as Record<string, unknown>;

    if (!partnerId || !amountBrl || !periodStart || !periodEnd) {
      sendError(res, 'INVALID_INPUT', 'partnerId, amountBrl, periodStart, and periodEnd are required', 400);
      return;
    }

    const payout = await createPayout(
      partnerId as string, tenantId, amountBrl as number,
      periodStart as string, periodEnd as string,
      (referralId as string) ?? null, supabaseClient,
    );

    sendSuccess(res, payout, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to create payout', 500, err);
  }
}

export async function handleListPayouts(req: Request, res: Response): Promise<void> {
  try {
    const { partnerId } = req.params;
    const payouts = await listPayouts(partnerId, supabaseClient);
    sendSuccess(res, { payouts, total: payouts.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to list payouts', 500, err);
  }
}

export async function handleApprovePayout(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const ok = await approvePayout(id, supabaseClient);

    if (!ok) {
      sendError(res, 'NOT_FOUND', 'Payout not found', 404);
      return;
    }

    sendSuccess(res, { approved: true, id });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to approve payout', 500, err);
  }
}

// API Pricing & Invoices
export async function handleGetApiPricing(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, { tiers: getApiPricing() });
}

export async function handleListApiInvoices(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const invoices = await listApiInvoices(tenantId, supabaseClient);
    sendSuccess(res, { invoices, total: invoices.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to list invoices', 500, err);
  }
}
