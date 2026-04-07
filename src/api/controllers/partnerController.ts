/**
 * Partner Controller — Scale & Distribution
 *
 * CRUD de parceiros, gerenciamento de API keys,
 * tracking de referrals e webhooks de integração.
 *
 * POST   /api/v1/partners              → Criar parceiro
 * GET    /api/v1/partners              → Listar parceiros
 * GET    /api/v1/partners/referral/:code → Buscar por código de referral
 * POST   /api/v1/partners/api-keys     → Criar API key
 * GET    /api/v1/partners/api-keys     → Listar API keys
 * DELETE /api/v1/partners/api-keys/:id → Revogar API key
 * POST   /api/v1/partners/referrals/click    → Registrar clique em referral
 * POST   /api/v1/partners/referrals/convert  → Converter referral
 * POST   /api/v1/partners/webhooks     → Registrar webhook
 * GET    /api/v1/partners/webhooks     → Listar webhooks
 * POST   /api/v1/partners/webhooks/test → Testar webhook dispatch
 *
 * Parte 103: Escala + API + Parcerias
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { logger } from '../../utils/logger.js';
import {
  createPartner,
  listPartners,
  getPartnerByReferralCode,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  trackReferralClick,
  convertReferral,
  registerWebhook,
  dispatchWebhook,
  listWebhooks,
} from '../../modules/partners/index.js';
import { PartnerType } from '../../domain/entities/partner.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForPartners(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

// ============================================================================
// Tenant helper
// ============================================================================

function getTenantId(req: Request): string {
  const ctx = (req as unknown as Record<string, unknown>)['tenantContext'] as
    | { tenantId: string }
    | undefined;
  return ctx?.tenantId ?? 'default';
}

// ============================================================================
// Partner CRUD
// ============================================================================

/** POST /partners — Criar parceiro */
export async function handleCreatePartner(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const { type, name, contactEmail, contactPhone, commission } = req.body as {
      type?: string;
      name?: string;
      contactEmail?: string;
      contactPhone?: string;
      commission?: { type: string; value: number; durationMonths: number };
    };

    if (!type || !name || !contactEmail) {
      sendError(res, 'INVALID_INPUT', 'type, name, and contactEmail are required', 400);
      return;
    }

    const validTypes = Object.values(PartnerType);
    if (!validTypes.includes(type as PartnerType)) {
      sendError(res, 'INVALID_INPUT', `Invalid type. Valid: ${validTypes.join(', ')}`, 400);
      return;
    }

    const partner = await createPartner({
      tenantId,
      type: type as PartnerType,
      name,
      contactEmail,
      contactPhone,
      commission: commission as never,
    }, supabaseClient);

    sendSuccess(res, partner, 201);
  } catch (err) {
    logger.error(`[Partners] Create error: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Failed to create partner', 500, err);
  }
}

/** GET /partners — Listar parceiros */
export async function handleListPartners(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const limit = Math.min(Number(req.query['limit']) || 50, 200);

    const partners = await listPartners(tenantId, supabaseClient, limit);
    sendSuccess(res, { partners, total: partners.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to list partners', 500, err);
  }
}

/** GET /partners/referral/:code — Buscar parceiro por código */
export async function handleGetByReferralCode(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.params;
    const partner = await getPartnerByReferralCode(code, supabaseClient);

    if (!partner) {
      sendError(res, 'NOT_FOUND', 'Partner not found for referral code', 404);
      return;
    }

    sendSuccess(res, partner);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to get partner', 500, err);
  }
}

// ============================================================================
// API Key Management
// ============================================================================

/** POST /partners/api-keys — Criar API key */
export async function handleCreateApiKey(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const { name, planTier } = req.body as { name?: string; planTier?: string };

    if (!name) {
      sendError(res, 'INVALID_INPUT', 'name is required', 400);
      return;
    }

    const result = await createApiKey(tenantId, name, planTier ?? 'basic', supabaseClient);

    sendSuccess(res, {
      key: result.key,
      record: result.record,
      warning: 'Store this key securely. It will not be shown again.',
    }, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to create API key', 500, err);
  }
}

/** GET /partners/api-keys — Listar API keys */
export async function handleListApiKeys(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const keys = await listApiKeys(tenantId, supabaseClient);

    sendSuccess(res, { keys, total: keys.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to list API keys', 500, err);
  }
}

/** DELETE /partners/api-keys/:id — Revogar API key */
export async function handleRevokeApiKey(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const revoked = await revokeApiKey(id, tenantId, supabaseClient);

    if (!revoked) {
      sendError(res, 'NOT_FOUND', 'API key not found or already revoked', 404);
      return;
    }

    sendSuccess(res, { revoked: true, id });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to revoke API key', 500, err);
  }
}

// ============================================================================
// Referral Tracking
// ============================================================================

/** POST /partners/referrals/click — Registrar clique em referral */
export async function handleReferralClick(req: Request, res: Response): Promise<void> {
  try {
    const { referralCode } = req.body as { referralCode?: string };

    if (!referralCode) {
      sendError(res, 'INVALID_INPUT', 'referralCode is required', 400);
      return;
    }

    const sourceIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket?.remoteAddress ?? null;

    const referral = await trackReferralClick(referralCode, sourceIp, supabaseClient);

    if (!referral) {
      sendError(res, 'NOT_FOUND', 'Invalid referral code', 404);
      return;
    }

    sendSuccess(res, referral, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to track referral click', 500, err);
  }
}

/** POST /partners/referrals/convert — Converter referral */
export async function handleReferralConvert(req: Request, res: Response): Promise<void> {
  try {
    const { referralCode, tenantId, planTier } = req.body as {
      referralCode?: string;
      tenantId?: string;
      planTier?: string;
    };

    if (!referralCode || !tenantId || !planTier) {
      sendError(res, 'INVALID_INPUT', 'referralCode, tenantId, and planTier are required', 400);
      return;
    }

    await convertReferral(referralCode, tenantId, planTier, supabaseClient);
    sendSuccess(res, { converted: true, referralCode, tenantId });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to convert referral', 500, err);
  }
}

// ============================================================================
// Integration Webhooks
// ============================================================================

/** POST /partners/webhooks — Registrar webhook */
export async function handleRegisterWebhook(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const { url, events } = req.body as { url?: string; events?: string[] };

    if (!url || !events || events.length === 0) {
      sendError(res, 'INVALID_INPUT', 'url and events[] are required', 400);
      return;
    }

    const webhook = await registerWebhook(tenantId, url, events, supabaseClient);

    sendSuccess(res, {
      webhook,
      warning: 'Store the webhook secret securely. It will not be shown again.',
    }, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to register webhook', 500, err);
  }
}

/** GET /partners/webhooks — Listar webhooks */
export async function handleListWebhooks(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const webhooks = await listWebhooks(tenantId, supabaseClient);

    sendSuccess(res, { webhooks, total: webhooks.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to list webhooks', 500, err);
  }
}

/** POST /partners/webhooks/test — Testar webhook dispatch */
export async function handleTestWebhook(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const { event } = req.body as { event?: string };

    await dispatchWebhook(
      tenantId,
      event ?? 'test.ping',
      { message: 'Test webhook dispatch', timestamp: new Date().toISOString() },
      supabaseClient,
    );

    sendSuccess(res, { dispatched: true, event: event ?? 'test.ping' });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to dispatch test webhook', 500, err);
  }
}
