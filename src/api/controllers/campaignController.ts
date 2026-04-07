/**
 * Campaign Controller — Content Campaign Orchestration
 *
 * POST /campaigns                     → Criar campanha a partir de estratégia
 * GET  /campaigns                     → Listar campanhas do tenant
 * GET  /campaigns/:id                 → Detalhe da campanha
 * POST /campaigns/:id/generate        → Gerar outputs para itens
 * GET  /campaigns/:id/items           → Listar itens da campanha
 * PATCH /campaigns/:id/status         → Transicionar status
 * PATCH /campaigns/:id/items/:itemId  → Atualizar item (link output, status)
 *
 * Todos tenant-scoped via tenantGuard.
 *
 * Parte 85: Content Campaign Orchestration
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';
import { generateStrategy } from '../../modules/strategy/index.js';
import {
  buildCampaignFromStrategy,
  saveCampaign,
  listCampaigns,
  getCampaign,
  transitionStatus,
  linkOutput,
  updateItemStatus,
} from '../../modules/campaigns/index.js';
import type { CampaignOutputLink } from '../../domain/entities/campaign.js';
import { CampaignStatus, CampaignItemStatus } from '../../domain/entities/campaign.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForCampaigns(client: SupabaseClientInstance): void {
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
 * POST /campaigns — Criar campanha a partir da estratégia do tenant
 */
export async function createCampaign(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { name } = req.body as { name?: string };

    // Generate strategy → build campaign
    const snapshot = await generateStrategy(tenantCtx, supabaseClient);
    const campaign = buildCampaignFromStrategy(snapshot, name);

    // Persist
    await saveCampaign(campaign, supabaseClient);

    sendSuccess(res, campaign, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao criar campanha', 500, err);
  }
}

/**
 * GET /campaigns — Listar campanhas do tenant
 */
export async function listCampaignsEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const campaigns = await listCampaigns(tenantCtx.tenantId, supabaseClient);

    sendSuccess(res, {
      campaigns,
      total: campaigns.length,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar campanhas', 500, err);
  }
}

/**
 * GET /campaigns/:id — Detalhe da campanha
 */
export async function getCampaignDetail(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;

    const campaign = await getCampaign(id!, tenantCtx.tenantId, supabaseClient);
    if (!campaign) {
      sendError(res, 'NOT_FOUND', 'Campanha não encontrada', 404);
      return;
    }

    sendSuccess(res, campaign);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar campanha', 500, err);
  }
}

/**
 * GET /campaigns/:id/items — Listar itens da campanha
 */
export async function getCampaignItems(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;

    const campaign = await getCampaign(id!, tenantCtx.tenantId, supabaseClient);
    if (!campaign) {
      sendError(res, 'NOT_FOUND', 'Campanha não encontrada', 404);
      return;
    }

    sendSuccess(res, {
      items: campaign.items,
      total: campaign.items.length,
      progress: campaign.progressPercent,
      counts: campaign.counts,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar itens', 500, err);
  }
}

/**
 * PATCH /campaigns/:id/status — Transicionar status da campanha
 */
export async function updateCampaignStatus(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;
    const { status } = req.body as { status?: string };

    if (!status || !Object.values(CampaignStatus).includes(status as CampaignStatus)) {
      sendError(res, 'INVALID_STATUS', 'Status inválido', 400);
      return;
    }

    const campaign = await getCampaign(id!, tenantCtx.tenantId, supabaseClient);
    if (!campaign) {
      sendError(res, 'NOT_FOUND', 'Campanha não encontrada', 404);
      return;
    }

    const ok = transitionStatus(campaign, status as CampaignStatus);
    if (!ok) {
      sendError(res, 'INVALID_TRANSITION', `Transição ${campaign.status} → ${status} não permitida`, 400);
      return;
    }

    await saveCampaign(campaign, supabaseClient);
    sendSuccess(res, campaign);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao atualizar status', 500, err);
  }
}

/**
 * PATCH /campaigns/:id/items/:itemId — Atualizar item (link output ou status)
 */
export async function updateCampaignItem(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id, itemId } = req.params;
    const body = req.body as { status?: string; outputLink?: Record<string, unknown> };

    const campaign = await getCampaign(id!, tenantCtx.tenantId, supabaseClient);
    if (!campaign) {
      sendError(res, 'NOT_FOUND', 'Campanha não encontrada', 404);
      return;
    }

    let updated = false;

    // Link output
    if (body.outputLink) {
      updated = linkOutput(campaign, itemId!, {
        outputType: body.outputLink['outputType'] as CampaignOutputLink['outputType'],
        outputId: body.outputLink['outputId'] as string,
        jobId: body.outputLink['jobId'] as string | undefined,
        outputUrl: body.outputLink['outputUrl'] as string | undefined,
        publicationId: body.outputLink['publicationId'] as string | undefined,
      });
    }

    // Update status
    if (body.status && Object.values(CampaignItemStatus).includes(body.status as CampaignItemStatus)) {
      updated = updateItemStatus(campaign, itemId!, body.status as CampaignItemStatus);
    }

    if (!updated) {
      sendError(res, 'NOT_FOUND', 'Item não encontrado ou sem alterações', 404);
      return;
    }

    await saveCampaign(campaign, supabaseClient);
    sendSuccess(res, campaign);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao atualizar item', 500, err);
  }
}

/**
 * POST /campaigns/:id/generate — Gerar outputs para itens pendentes
 * (Placeholder — orquestração real via jobs/queue)
 */
export async function generateCampaignOutputs(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;

    const campaign = await getCampaign(id!, tenantCtx.tenantId, supabaseClient);
    if (!campaign) {
      sendError(res, 'NOT_FOUND', 'Campanha não encontrada', 404);
      return;
    }

    const pendingItems = campaign.items.filter(
      (i) => i.status === CampaignItemStatus.DRAFT || i.status === CampaignItemStatus.PENDING_OUTPUT,
    );

    sendSuccess(res, {
      campaignId: campaign.id,
      pendingItems: pendingItems.length,
      message: `${pendingItems.length} itens aguardando geração de output. Use o pipeline para processar cada item.`,
      items: pendingItems.map((i) => ({
        id: i.id,
        role: i.role,
        format: i.format,
        channel: i.channel,
        templateId: i.templateId,
        styleId: i.styleId,
      })),
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar outputs', 500, err);
  }
}
