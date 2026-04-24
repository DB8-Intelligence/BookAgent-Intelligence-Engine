/**
 * Hotmart Webhook Controller — BookAgent Intelligence Engine
 *
 * Endpoint dedicado para receber eventos do Hotmart e sincronizar
 * o status dos planos na tabela bookagent_user_plans.
 *
 * POST /webhooks/hotmart
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { HotmartBillingProvider } from '../../modules/billing/providers/hotmart-provider.js';
import { applyWebhookToFirestore } from '../../modules/billing/webhook-bridge.js';
import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';
import { logger } from '../../utils/logger.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setHotmartWebhookClient(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

// ---------------------------------------------------------------------------
// Plano → limites
// ---------------------------------------------------------------------------

const PLAN_BOOKS_LIMIT: Record<string, number> = {
  free:    1,
  starter: 1,
  pro:     3,
  agency:  10,
};

const TIER_TO_PLAN: Record<string, string> = {
  starter:  'starter',
  basic:    'starter',  // legado
  pro:      'pro',
  business: 'agency',   // legado
  agency:   'agency',
};

// ---------------------------------------------------------------------------
// POST /webhooks/hotmart
// ---------------------------------------------------------------------------

export async function handleHotmartWebhook(req: Request, res: Response): Promise<void> {
  const provider = new HotmartBillingProvider();

  const hottokHeader = req.headers['x-hotmart-hottok'] as string | undefined;
  const rawBody = JSON.stringify(req.body);
  const isValid = provider.verifyWebhookSignature(rawBody, hottokHeader ?? '');

  if (!isValid) {
    logger.warn('[HotmartWebhook] Hottok inválido — rejeitando');
    sendError(res, 'UNAUTHORIZED', 'Hottok inválido', 401);
    return;
  }

  const parsed = provider.parseWebhookEvent(req.body as Record<string, unknown>);

  if (!parsed) {
    sendSuccess(res, { ignored: true, reason: 'evento não tratado' });
    return;
  }

  const { eventType, externalEventId, externalCustomerId, externalSubscriptionId, planTier, amountBRL, metadata } = parsed;

  logger.info(`[HotmartWebhook] ${eventType} | email=${externalCustomerId} | plan=${planTier}`);

  // Idempotência
  if (supabaseClient && externalEventId) {
    try {
      const existing = await supabaseClient.select<{ id: string }>(
        'bookagent_webhook_events',
        { filters: [{ column: 'source', operator: 'eq', value: externalEventId }], limit: 1 },
      );

      if (existing.length > 0) {
        logger.info(`[HotmartWebhook] Evento duplicado ignorado: ${externalEventId}`);
        sendSuccess(res, { duplicate: true });
        return;
      }

      await supabaseClient.insert('bookagent_webhook_events', {
        event_type: eventType,
        source: externalEventId,
        payload: req.body,
        processed: false,
      });
    } catch (err) {
      logger.error(`[HotmartWebhook] Erro idempotência: ${err}`);
    }
  }

  try {
    if (eventType === 'subscription.created') {
      await activatePlan({
        email: externalCustomerId ?? '',
        phone: metadata?.buyerPhone as string | undefined,
        planTier: planTier ?? 'starter',
        hotmartSubId: externalSubscriptionId,
        amountBRL,
      });
      const fs = await applyWebhookToFirestore({
        source: 'hotmart',
        eventType: 'activate',
        email: externalCustomerId ?? '',
        planTier: planTier ?? 'starter',
        externalSubscriptionId,
        amountBRL,
      });
      if (!fs.synced) {
        logger.warn(`[HotmartWebhook] Firestore sync pending: ${fs.reason}`);
      }
    } else if (eventType === 'subscription.canceled') {
      await cancelPlan({
        email: externalCustomerId ?? '',
        hotmartSubId: externalSubscriptionId,
      });
      await applyWebhookToFirestore({
        source: 'hotmart',
        eventType: 'cancel',
        email: externalCustomerId ?? '',
        planTier: 'starter',
        externalSubscriptionId,
      });
    }

    if (supabaseClient && externalEventId) {
      await supabaseClient.update(
        'bookagent_webhook_events',
        { column: 'source', operator: 'eq', value: externalEventId },
        { processed: true },
      );
    }

    sendSuccess(res, { processed: true, eventType, email: externalCustomerId, plan: planTier });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[HotmartWebhook] Erro ao processar: ${message}`);

    if (supabaseClient && externalEventId) {
      await supabaseClient.update(
        'bookagent_webhook_events',
        { column: 'source', operator: 'eq', value: externalEventId },
        { processed: false, error: message },
      ).catch(() => null);
    }

    sendError(res, 'PROCESSING_ERROR', message, 500);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ActivatePlanInput {
  email: string;
  phone?: string;
  planTier: string;
  hotmartSubId?: string;
  amountBRL?: number;
}

async function activatePlan(input: ActivatePlanInput): Promise<void> {
  if (!supabaseClient) return;

  const plan = TIER_TO_PLAN[input.planTier] ?? 'starter';
  const booksLimit = PLAN_BOOKS_LIMIT[plan] ?? 1;
  const validUntil = new Date();
  validUntil.setMonth(validUntil.getMonth() + 1);

  await supabaseClient.upsert(
    'bookagent_user_plans',
    {
      user_id: input.email || null,
      phone: input.phone || null,
      plan,
      hotmart_sub_id: input.hotmartSubId ?? null,
      status: 'active',
      books_limit: booksLimit,
      books_used: 0,
      valid_until: validUntil.toISOString(),
      updated_at: new Date().toISOString(),
    },
    input.email ? 'user_id' : 'phone',
  );

  logger.info(`[HotmartWebhook] Plano ativado: ${input.email} → ${plan} (${booksLimit} books/mês)`);
}

interface CancelPlanInput {
  email: string;
  hotmartSubId?: string;
}

async function cancelPlan(input: CancelPlanInput): Promise<void> {
  if (!supabaseClient || !input.email) return;

  await supabaseClient.update(
    'bookagent_user_plans',
    { column: 'user_id', operator: 'eq', value: input.email },
    {
      plan: 'free',
      status: 'cancelled',
      books_limit: 1,
      valid_until: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  );

  logger.info(`[HotmartWebhook] Plano cancelado: ${input.email} → free`);
}
