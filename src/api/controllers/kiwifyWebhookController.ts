/**
 * Kiwify Webhook Controller — BookAgent Intelligence Engine
 *
 * Recebe eventos do Kiwify e sincroniza planos na tabela bookagent_user_plans.
 *
 * POST /webhooks/kiwify
 *
 * Eventos tratados:
 *   compra_aprovada       → ativar plano
 *   subscription_renewed  → renovar plano
 *   subscription_canceled → cancelar plano → reverter para free
 *   compra_reembolsada    → reverter para free
 *   chargeback            → reverter para free
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { KiwifyBillingProvider } from '../../modules/billing/providers/kiwify-provider.js';
import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';
import { logger } from '../../utils/logger.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setKiwifyWebhookClient(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

// ---------------------------------------------------------------------------
// Limites por plano
// ---------------------------------------------------------------------------

const PLAN_BOOKS_LIMIT: Record<string, number> = {
  free:    1,
  starter: 1,
  pro:     3,
  agency:  10,
};

// ---------------------------------------------------------------------------
// POST /webhooks/kiwify
// ---------------------------------------------------------------------------

export async function handleKiwifyWebhook(req: Request, res: Response): Promise<void> {
  const provider = new KiwifyBillingProvider();
  const rawBody  = JSON.stringify(req.body);

  // Validação do token (Kiwify envia o token no body)
  const isValid = provider.verifyWebhookSignature(rawBody, '');
  if (!isValid) {
    sendError(res, 'UNAUTHORIZED', 'Token de webhook inválido', 401);
    return;
  }

  const parsed = provider.parseWebhookEvent(req.body as Record<string, unknown>);
  if (!parsed) {
    sendSuccess(res, { ignored: true, reason: 'evento não tratado' });
    return;
  }

  const { eventType, externalEventId, externalCustomerId, externalSubscriptionId, planTier, amountBRL, metadata } = parsed;

  logger.info(`[KiwifyWebhook] ${eventType} | email=${externalCustomerId} | plan=${planTier} | amount=R$${amountBRL}`);

  // Idempotência — evita processar o mesmo evento duas vezes
  if (supabaseClient && externalEventId) {
    try {
      const existing = await supabaseClient.select<{ id: string }>(
        'bookagent_webhook_events',
        { filters: [{ column: 'source', operator: 'eq', value: `kiwify:${externalEventId}` }], limit: 1 },
      );
      if (existing.length > 0) {
        logger.info(`[KiwifyWebhook] Evento duplicado ignorado: ${externalEventId}`);
        sendSuccess(res, { duplicate: true });
        return;
      }
      await supabaseClient.insert('bookagent_webhook_events', {
        event_type: eventType,
        source:     `kiwify:${externalEventId}`,
        payload:    req.body,
        processed:  false,
      });
    } catch (err) {
      logger.error(`[KiwifyWebhook] Erro idempotência: ${err}`);
    }
  }

  try {
    if (eventType === 'subscription.created') {
      await activatePlan({
        email:        externalCustomerId ?? '',
        phone:        metadata?.buyerPhone as string | undefined,
        planTier:     planTier ?? 'starter',
        kiwifySubId:  externalSubscriptionId,
        amountBRL,
      });
    } else if (eventType === 'subscription.canceled') {
      await cancelPlan({
        email:       externalCustomerId ?? '',
        kiwifySubId: externalSubscriptionId,
      });
    }

    // Marca como processado
    if (supabaseClient && externalEventId) {
      await supabaseClient.update(
        'bookagent_webhook_events',
        { column: 'source', operator: 'eq', value: `kiwify:${externalEventId}` },
        { processed: true },
      );
    }

    sendSuccess(res, { processed: true, eventType, email: externalCustomerId, plan: planTier });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[KiwifyWebhook] Erro ao processar: ${message}`);

    if (supabaseClient && externalEventId) {
      await supabaseClient.update(
        'bookagent_webhook_events',
        { column: 'source', operator: 'eq', value: `kiwify:${externalEventId}` },
        { processed: false, error: message },
      ).catch(() => null);
    }

    sendError(res, 'PROCESSING_ERROR', message, 500);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function activatePlan(input: {
  email: string;
  phone?: string;
  planTier: string;
  kiwifySubId?: string;
  amountBRL?: number;
}): Promise<void> {
  if (!supabaseClient) return;

  const plan       = input.planTier || 'starter';
  const booksLimit = PLAN_BOOKS_LIMIT[plan] ?? 1;
  const validUntil = new Date();
  validUntil.setMonth(validUntil.getMonth() + 1);

  await supabaseClient.upsert(
    'bookagent_user_plans',
    {
      user_id:        input.email || null,
      phone:          input.phone || null,
      plan,
      hotmart_sub_id: input.kiwifySubId ?? null, // reutiliza coluna existente
      status:         'active',
      books_limit:    booksLimit,
      books_used:     0,
      valid_until:    validUntil.toISOString(),
      updated_at:     new Date().toISOString(),
    },
    input.email ? 'user_id' : 'phone',
  );

  logger.info(`[KiwifyWebhook] Plano ativado: ${input.email} → ${plan} (${booksLimit} books/mês)`);
}

async function cancelPlan(input: { email: string; kiwifySubId?: string }): Promise<void> {
  if (!supabaseClient || !input.email) return;

  await supabaseClient.update(
    'bookagent_user_plans',
    { column: 'user_id', operator: 'eq', value: input.email },
    {
      plan:        'free',
      status:      'cancelled',
      books_limit: 1,
      valid_until: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    },
  );

  logger.info(`[KiwifyWebhook] Plano cancelado: ${input.email} → free`);
}
