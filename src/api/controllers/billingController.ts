/**
 * Billing Controller — Billing Gateway Integration
 *
 * Endpoints:
 *   POST /billing/webhooks/:provider  → Recebe webhooks do gateway
 *   POST /billing/subscriptions       → Cria assinatura
 *   GET  /billing/subscriptions/:tenantId → Consulta assinatura
 *   POST /billing/subscriptions/:tenantId/change-plan → Upgrade/downgrade
 *   POST /billing/subscriptions/:tenantId/cancel → Cancela
 *   POST /billing/subscriptions/:tenantId/reactivate → Reativa
 *   GET  /billing/usage/:tenantId     → Resumo de uso
 *
 * Parte 76: Billing Gateway Integration
 */

import type { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { sendSuccess, sendError } from '../helpers/response.js';
import {
  createSubscription,
  changePlan,
  cancelSubscription,
  reactivateSubscription,
  getSubscription,
  processWebhookEvent,
} from '../../modules/billing/subscription-manager.js';
import { getUsageSummary } from '../../modules/billing/limit-checker.js';
import { getBillingProvider, getProviderByType } from '../../modules/billing/provider-factory.js';
import {
  BillingProvider,
  WebhookProcessingStatus,
} from '../../domain/entities/subscription.js';
import type { PaymentWebhookEvent } from '../../domain/entities/subscription.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForBilling(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

// ============================================================================
// Schemas
// ============================================================================

const CreateSubscriptionSchema = z.object({
  tenantId: z.string().min(1),
  planTier: z.enum(['starter', 'pro', 'agency']),
  trial: z.boolean().optional().default(false),
  trialDays: z.number().positive().optional(),
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(),
});

const ChangePlanSchema = z.object({
  toPlan: z.enum(['starter', 'pro', 'agency']),
  immediate: z.boolean().optional().default(true),
  requestedBy: z.string().min(1),
});

const CancelSchema = z.object({
  reason: z.string().min(1),
});

// ============================================================================
// POST /billing/webhooks/:provider
// ============================================================================

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const providerName = req.params.provider;

  // Resolve provider
  const providerType = providerName as BillingProvider;
  const provider = getProviderByType(providerType) ?? getBillingProvider();

  // Verify signature (if provider supports it)
  const signature = req.headers['stripe-signature']
    ?? req.headers['x-webhook-signature']
    ?? '';

  if (provider.provider !== BillingProvider.MANUAL) {
    const rawBody = JSON.stringify(req.body);
    if (!provider.verifyWebhookSignature(rawBody, signature as string)) {
      logger.warn(`[billingController] Webhook signature invalid from ${providerName}`);
      // Don't reject — log and continue (V1 tolerance)
    }
  }

  // Build webhook event
  const webhookEvent: PaymentWebhookEvent = {
    id: uuid(),
    provider: providerType,
    eventType: req.body.type ?? req.body.eventType ?? 'unknown',
    externalEventId: req.body.id ?? req.body.eventId,
    externalCustomerId: req.body.data?.object?.customer ?? req.body.customerId,
    rawPayload: req.body,
    processingStatus: WebhookProcessingStatus.RECEIVED,
    sourceIp: req.ip,
    headers: {
      'content-type': req.headers['content-type'] as string ?? '',
      'user-agent': req.headers['user-agent'] as string ?? '',
    },
    receivedAt: new Date(),
  };

  try {
    const processed = await processWebhookEvent(webhookEvent, supabaseClient);

    logger.info(
      `[billingController] Webhook processed: ${processed.eventType} ` +
      `status=${processed.processingStatus} action="${processed.appliedAction}"`,
    );

    // Always respond 200 to gateway (per webhook best practices)
    res.status(200).json({ received: true, processingStatus: processed.processingStatus });
  } catch (err) {
    logger.error(`[billingController] Webhook processing error: ${err}`);
    // Still respond 200 to avoid gateway retries on our errors
    res.status(200).json({ received: true, processingStatus: 'error' });
  }
}

// ============================================================================
// POST /billing/subscriptions
// ============================================================================

export async function createSubscriptionEndpoint(req: Request, res: Response): Promise<void> {
  const parsed = CreateSubscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Dados inválidos', 400, parsed.error.flatten());
    return;
  }

  try {
    const subscription = await createSubscription(
      parsed.data.tenantId,
      parsed.data.planTier,
      supabaseClient,
      {
        trial: parsed.data.trial,
        trialDays: parsed.data.trialDays,
        customerEmail: parsed.data.customerEmail,
        customerName: parsed.data.customerName,
      },
    );

    sendSuccess(res, {
      subscriptionId: subscription.id,
      tenantId: subscription.tenantId,
      planTier: subscription.planTier,
      status: subscription.status,
      provider: subscription.provider,
      externalSubscriptionId: subscription.externalSubscriptionId,
      trialEndsAt: subscription.trialEndsAt,
      message: subscription.status === 'trial'
        ? `Trial iniciado. Expira em ${subscription.trialEndsAt?.toISOString()}.`
        : `Assinatura ${subscription.planTier} ativada.`,
    }, 201);
  } catch (err) {
    logger.error(`[billingController] Failed to create subscription: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Falha ao criar assinatura', 500, err);
  }
}

// ============================================================================
// GET /billing/subscriptions/:tenantId
// ============================================================================

export async function getSubscriptionEndpoint(req: Request, res: Response): Promise<void> {
  const { tenantId } = req.params;

  try {
    const subscription = await getSubscription(tenantId, supabaseClient);
    if (!subscription) {
      sendError(res, 'NOT_FOUND', 'Assinatura não encontrada', 404);
      return;
    }

    sendSuccess(res, subscription);
  } catch (err) {
    sendError(res, 'DB_ERROR', 'Erro ao buscar assinatura', 500, err);
  }
}

// ============================================================================
// POST /billing/subscriptions/:tenantId/change-plan
// ============================================================================

export async function changePlanEndpoint(req: Request, res: Response): Promise<void> {
  const { tenantId } = req.params;

  const parsed = ChangePlanSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Dados inválidos', 400, parsed.error.flatten());
    return;
  }

  const currentSub = await getSubscription(tenantId, supabaseClient);
  if (!currentSub) {
    sendError(res, 'NOT_FOUND', 'Assinatura não encontrada', 404);
    return;
  }

  const fromPlan = currentSub.planTier;
  const toPlan = parsed.data.toPlan;
  if (fromPlan === toPlan) {
    sendError(res, 'SAME_PLAN', 'Já está neste plano', 400);
    return;
  }

  const order: Record<string, number> = { basic: 0, pro: 1, business: 2 };
  const direction = order[toPlan]! > order[fromPlan]! ? 'upgrade' : 'downgrade';

  try {
    const updated = await changePlan({
      tenantId,
      fromPlan,
      toPlan,
      direction,
      immediate: parsed.data.immediate,
      requestedBy: parsed.data.requestedBy,
      requestedAt: new Date(),
    }, supabaseClient);

    if (!updated) {
      sendError(res, 'CHANGE_FAILED', 'Falha ao alterar plano', 500);
      return;
    }

    sendSuccess(res, {
      tenantId,
      fromPlan,
      toPlan,
      direction,
      status: updated.status,
      message: `Plano alterado: ${fromPlan} → ${toPlan} (${direction}).`,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao alterar plano', 500, err);
  }
}

// ============================================================================
// POST /billing/subscriptions/:tenantId/cancel
// ============================================================================

export async function cancelSubscriptionEndpoint(req: Request, res: Response): Promise<void> {
  const { tenantId } = req.params;

  const parsed = CancelSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Motivo obrigatório', 400, parsed.error.flatten());
    return;
  }

  try {
    const result = await cancelSubscription(tenantId, parsed.data.reason, supabaseClient);
    if (!result) {
      sendError(res, 'NOT_FOUND', 'Assinatura não encontrada', 404);
      return;
    }

    sendSuccess(res, {
      tenantId,
      status: result.status,
      canceledAt: result.canceledAt,
      message: 'Assinatura cancelada.',
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao cancelar', 500, err);
  }
}

// ============================================================================
// POST /billing/subscriptions/:tenantId/reactivate
// ============================================================================

export async function reactivateSubscriptionEndpoint(req: Request, res: Response): Promise<void> {
  const { tenantId } = req.params;

  try {
    const result = await reactivateSubscription(tenantId, supabaseClient);
    if (!result) {
      sendError(res, 'NOT_FOUND', 'Assinatura não encontrada', 404);
      return;
    }

    sendSuccess(res, {
      tenantId,
      status: result.status,
      message: 'Assinatura reativada.',
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao reativar', 500, err);
  }
}

// ============================================================================
// GET /billing/usage/:tenantId
// ============================================================================

export async function getUsageEndpoint(req: Request, res: Response): Promise<void> {
  const { tenantId } = req.params;

  const tenantContext = req.tenantContext ?? createDefaultTenantContext(undefined, 'starter');
  // Override tenantId for the query
  const ctx = { ...tenantContext, tenantId };

  try {
    const summary = await getUsageSummary(ctx, supabaseClient);
    sendSuccess(res, summary);
  } catch (err) {
    sendError(res, 'DB_ERROR', 'Erro ao gerar resumo de uso', 500, err);
  }
}
