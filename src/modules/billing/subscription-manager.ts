/**
 * Subscription Manager — Billing Gateway Integration
 *
 * Gerencia ciclo de vida de assinaturas:
 *   - Criação (trial ou ativa)
 *   - Upgrade / downgrade
 *   - Cancelamento / reativação
 *   - Sincronização com gateway externo
 *   - Aplicação de mudanças no tenant plan/features/limits
 *
 * Fluxo do webhook até o tenant plan:
 *   1. Webhook recebido → parseWebhookEvent()
 *   2. Evento normalizado → processWebhookEvent()
 *   3. Subscription atualizada no DB
 *   4. Tenant plan/features/limits sincronizados
 *   5. BillingEvent registrado (audit trail)
 *
 * Persistência: bookagent_subscriptions
 *
 * Parte 76: Billing Gateway Integration
 */

import { v4 as uuid } from 'uuid';

import type {
  Subscription,
  PaymentWebhookEvent,
  PlanChangeRequest,
} from '../../domain/entities/subscription.js';
import {
  SubscriptionStatus,
  BillingProvider,
  WebhookEventType,
  WebhookProcessingStatus,
  VALID_SUBSCRIPTION_TRANSITIONS,
  DEFAULT_TRIAL_DAYS,
} from '../../domain/entities/subscription.js';
import { BillingEventType } from '../../domain/entities/billing.js';
import {
  PLAN_FEATURES,
  PLAN_TENANT_LIMITS,
} from '../../domain/entities/tenant.js';
import type { PlanTier } from '../../plans/plan-config.js';
import { PLANS } from '../../plans/plan-config.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { logger } from '../../utils/logger.js';

import { getBillingProvider } from './provider-factory.js';
import { recordBillingEvent } from './usage-meter.js';
import type { ParsedWebhookEvent } from './billing-provider.js';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const SUBSCRIPTIONS_TABLE = 'bookagent_subscriptions';
const WEBHOOK_EVENTS_TABLE = 'bookagent_webhook_events';

// ---------------------------------------------------------------------------
// Create Subscription
// ---------------------------------------------------------------------------

/**
 * Cria uma nova assinatura para um tenant.
 * Opcionalmente cria customer e subscription no gateway externo.
 */
export async function createSubscription(
  tenantId: string,
  planTier: PlanTier,
  supabase: SupabaseClient | null,
  options?: {
    trial?: boolean;
    trialDays?: number;
    customerEmail?: string;
    customerName?: string;
  },
): Promise<Subscription> {
  const now = new Date();
  const plan = PLANS[planTier];
  const provider = getBillingProvider();

  const isTrial = options?.trial ?? false;
  const trialDays = options?.trialDays ?? DEFAULT_TRIAL_DAYS;

  let externalCustomerId: string | undefined;
  let externalSubscriptionId: string | undefined;
  let externalPlanId: string | undefined;

  // Create in external gateway
  if (provider.isConfigured() && options?.customerEmail) {
    const customerResult = await provider.createCustomer({
      tenantId,
      name: options.customerName ?? tenantId,
      email: options.customerEmail,
    });

    if (customerResult.success && customerResult.data) {
      externalCustomerId = customerResult.data.customerId;

      const subResult = await provider.createSubscription({
        externalCustomerId,
        planTier,
        trialDays: isTrial ? trialDays : undefined,
      });

      if (subResult.success && subResult.data) {
        externalSubscriptionId = subResult.data.subscriptionId;
        externalPlanId = subResult.data.planId;
      }
    }
  }

  const subscription: Subscription = {
    id: uuid(),
    tenantId,
    planTier,
    status: isTrial ? SubscriptionStatus.TRIAL : SubscriptionStatus.ACTIVE,
    provider: provider.provider,
    externalCustomerId,
    externalSubscriptionId,
    externalPlanId,
    priceMonthlyBRL: plan.priceMonthlyBRL,
    startedAt: now,
    trialEndsAt: isTrial ? new Date(now.getTime() + trialDays * 86400000) : undefined,
    createdAt: now,
    updatedAt: now,
  };

  if (supabase) {
    await persistSubscription(supabase, subscription);
  }

  // Record billing event
  await recordBillingEvent({
    tenantId,
    eventType: isTrial ? BillingEventType.TRIAL_STARTED : BillingEventType.PLAN_ACTIVATED,
    currentPlan: planTier,
    details: isTrial
      ? `Trial de ${trialDays} dias iniciado para plano ${planTier}`
      : `Plano ${planTier} ativado`,
    metadata: { subscriptionId: subscription.id, externalSubscriptionId },
  }, supabase);

  logger.info(
    `[SubscriptionManager] Created subscription ${subscription.id}: ` +
    `tenant=${tenantId} plan=${planTier} status=${subscription.status} ` +
    `provider=${provider.provider}`,
  );

  return subscription;
}

// ---------------------------------------------------------------------------
// Change Plan
// ---------------------------------------------------------------------------

/**
 * Muda o plano de uma assinatura (upgrade ou downgrade).
 */
export async function changePlan(
  request: PlanChangeRequest,
  supabase: SupabaseClient | null,
): Promise<Subscription | null> {
  const subscription = await getSubscription(request.tenantId, supabase);
  if (!subscription) {
    logger.warn(`[SubscriptionManager] No subscription for tenant ${request.tenantId}`);
    return null;
  }

  const provider = getBillingProvider();
  const newPlan = PLANS[request.toPlan];

  // Change in external gateway
  if (subscription.externalSubscriptionId && provider.isConfigured()) {
    const result = await provider.changePlan({
      externalSubscriptionId: subscription.externalSubscriptionId,
      newPlanTier: request.toPlan,
      immediate: request.immediate,
    });

    if (!result.success) {
      logger.error(
        `[SubscriptionManager] Gateway plan change failed: ${result.error}`,
      );
      // Continue with internal change even if gateway fails (will be synced later)
    }
  }

  // Update subscription
  subscription.previousPlanTier = subscription.planTier;
  subscription.planTier = request.toPlan;
  subscription.priceMonthlyBRL = newPlan.priceMonthlyBRL;
  subscription.updatedAt = new Date();

  if (supabase) {
    await updateSubscription(supabase, subscription);
  }

  // Record billing event
  const eventType = request.direction === 'upgrade'
    ? BillingEventType.PLAN_UPGRADED
    : BillingEventType.PLAN_DOWNGRADED;

  await recordBillingEvent({
    tenantId: request.tenantId,
    eventType,
    previousPlan: request.fromPlan,
    currentPlan: request.toPlan,
    details: `${request.direction}: ${request.fromPlan} → ${request.toPlan}`,
    metadata: { requestedBy: request.requestedBy, immediate: request.immediate },
  }, supabase);

  logger.info(
    `[SubscriptionManager] Plan changed: tenant=${request.tenantId} ` +
    `${request.fromPlan} → ${request.toPlan} (${request.direction})`,
  );

  return subscription;
}

// ---------------------------------------------------------------------------
// Cancel / Reactivate
// ---------------------------------------------------------------------------

/**
 * Cancela uma assinatura.
 */
export async function cancelSubscription(
  tenantId: string,
  reason: string,
  supabase: SupabaseClient | null,
): Promise<Subscription | null> {
  const subscription = await getSubscription(tenantId, supabase);
  if (!subscription) return null;

  if (!isValidTransition(subscription.status, SubscriptionStatus.CANCELED)) {
    logger.warn(`[SubscriptionManager] Invalid transition: ${subscription.status} → canceled`);
    return subscription;
  }

  const provider = getBillingProvider();
  if (subscription.externalSubscriptionId && provider.isConfigured()) {
    await provider.cancelSubscription(subscription.externalSubscriptionId);
  }

  subscription.status = SubscriptionStatus.CANCELED;
  subscription.canceledAt = new Date();
  subscription.cancelReason = reason;
  subscription.updatedAt = new Date();

  if (supabase) await updateSubscription(supabase, subscription);

  await recordBillingEvent({
    tenantId,
    eventType: BillingEventType.PLAN_DOWNGRADED,
    currentPlan: subscription.planTier,
    details: `Assinatura cancelada: ${reason}`,
  }, supabase);

  logger.info(`[SubscriptionManager] Subscription canceled: tenant=${tenantId}`);
  return subscription;
}

/**
 * Reativa uma assinatura cancelada.
 */
export async function reactivateSubscription(
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<Subscription | null> {
  const subscription = await getSubscription(tenantId, supabase);
  if (!subscription) return null;

  if (!isValidTransition(subscription.status, SubscriptionStatus.ACTIVE)) {
    logger.warn(`[SubscriptionManager] Invalid transition: ${subscription.status} → active`);
    return subscription;
  }

  const provider = getBillingProvider();
  if (subscription.externalSubscriptionId && provider.isConfigured()) {
    await provider.reactivateSubscription(subscription.externalSubscriptionId);
  }

  subscription.status = SubscriptionStatus.ACTIVE;
  subscription.canceledAt = undefined;
  subscription.cancelReason = undefined;
  subscription.updatedAt = new Date();

  if (supabase) await updateSubscription(supabase, subscription);

  await recordBillingEvent({
    tenantId,
    eventType: BillingEventType.PLAN_ACTIVATED,
    currentPlan: subscription.planTier,
    details: 'Assinatura reativada',
  }, supabase);

  logger.info(`[SubscriptionManager] Subscription reactivated: tenant=${tenantId}`);
  return subscription;
}

// ---------------------------------------------------------------------------
// Process Webhook Event
// ---------------------------------------------------------------------------

/**
 * Processa um evento de webhook do gateway.
 * Aplica mudanças no tenant/subscription baseado no evento.
 */
export async function processWebhookEvent(
  webhookEvent: PaymentWebhookEvent,
  supabase: SupabaseClient | null,
): Promise<PaymentWebhookEvent> {
  webhookEvent.processingStatus = WebhookProcessingStatus.PROCESSING;

  try {
    const provider = getBillingProvider();
    const parsed = provider.parseWebhookEvent(webhookEvent.rawPayload);

    if (!parsed) {
      webhookEvent.processingStatus = WebhookProcessingStatus.IGNORED;
      webhookEvent.appliedAction = 'Evento não reconhecido pelo provider';
      webhookEvent.processedAt = new Date();
      if (supabase) await persistWebhookEvent(supabase, webhookEvent);
      return webhookEvent;
    }

    // Resolve tenant from external customer ID
    let tenantId = webhookEvent.tenantId;
    if (!tenantId && parsed.externalCustomerId && supabase) {
      tenantId = await resolveTenantFromExternalId(
        parsed.externalCustomerId,
        supabase,
      );
    }

    if (!tenantId) {
      webhookEvent.processingStatus = WebhookProcessingStatus.FAILED;
      webhookEvent.processingError = 'Tenant não encontrado para este customer';
      webhookEvent.processedAt = new Date();
      if (supabase) await persistWebhookEvent(supabase, webhookEvent);
      return webhookEvent;
    }

    webhookEvent.tenantId = tenantId;

    // Apply action based on event type
    const action = await applyWebhookAction(
      tenantId,
      parsed,
      webhookEvent.eventType,
      supabase,
    );

    webhookEvent.processingStatus = WebhookProcessingStatus.APPLIED;
    webhookEvent.appliedAction = action;
    webhookEvent.processedAt = new Date();

    if (supabase) await persistWebhookEvent(supabase, webhookEvent);

    logger.info(
      `[SubscriptionManager] Webhook processed: ${webhookEvent.eventType} ` +
      `tenant=${tenantId} action="${action}"`,
    );

    return webhookEvent;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    webhookEvent.processingStatus = WebhookProcessingStatus.FAILED;
    webhookEvent.processingError = error;
    webhookEvent.processedAt = new Date();

    if (supabase) await persistWebhookEvent(supabase, webhookEvent);

    logger.error(`[SubscriptionManager] Webhook processing failed: ${error}`);
    return webhookEvent;
  }
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Obtém a assinatura ativa de um tenant.
 */
export async function getSubscription(
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<Subscription | null> {
  if (!supabase) return null;

  try {
    const rows = await supabase.select<SubscriptionRow>(SUBSCRIPTIONS_TABLE, {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      orderBy: 'created_at',
      orderDesc: true,
      limit: 1,
    });

    return rows.length > 0 ? rowToSubscription(rows[0]) : null;
  } catch (err) {
    logger.warn(`[SubscriptionManager] Failed to get subscription for ${tenantId}: ${err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Apply Webhook Actions
// ---------------------------------------------------------------------------

async function applyWebhookAction(
  tenantId: string,
  parsed: ParsedWebhookEvent,
  eventType: WebhookEventType,
  supabase: SupabaseClient | null,
): Promise<string> {
  switch (eventType) {
    case WebhookEventType.PAYMENT_SUCCEEDED: {
      const sub = await getSubscription(tenantId, supabase);
      if (sub && sub.status === SubscriptionStatus.PAST_DUE) {
        sub.status = SubscriptionStatus.ACTIVE;
        sub.lastPaymentAt = new Date();
        sub.updatedAt = new Date();
        if (supabase) await updateSubscription(supabase, sub);
      }
      return 'Pagamento aprovado — assinatura ativa';
    }

    case WebhookEventType.PAYMENT_FAILED: {
      const sub = await getSubscription(tenantId, supabase);
      if (sub && sub.status === SubscriptionStatus.ACTIVE) {
        sub.status = SubscriptionStatus.PAST_DUE;
        sub.updatedAt = new Date();
        if (supabase) await updateSubscription(supabase, sub);
      }
      return 'Pagamento falhou — assinatura past_due';
    }

    case WebhookEventType.SUBSCRIPTION_CANCELED: {
      await cancelSubscription(tenantId, 'Cancelamento via gateway', supabase);
      return 'Assinatura cancelada via gateway';
    }

    case WebhookEventType.SUBSCRIPTION_UPDATED: {
      if (parsed.planTier) {
        const sub = await getSubscription(tenantId, supabase);
        if (sub && sub.planTier !== parsed.planTier) {
          const direction = planDirection(sub.planTier, parsed.planTier);
          await changePlan({
            tenantId,
            fromPlan: sub.planTier,
            toPlan: parsed.planTier,
            direction,
            immediate: true,
            requestedBy: 'gateway_webhook',
            requestedAt: new Date(),
          }, supabase);
          return `Plano alterado: ${sub.planTier} → ${parsed.planTier} (${direction})`;
        }
      }
      return 'Assinatura atualizada';
    }

    case WebhookEventType.SUBSCRIPTION_REACTIVATED: {
      await reactivateSubscription(tenantId, supabase);
      return 'Assinatura reativada via gateway';
    }

    case WebhookEventType.TRIAL_EXPIRED: {
      const sub = await getSubscription(tenantId, supabase);
      if (sub && sub.status === SubscriptionStatus.TRIAL) {
        sub.status = SubscriptionStatus.SUSPENDED;
        sub.updatedAt = new Date();
        if (supabase) await updateSubscription(supabase, sub);

        await recordBillingEvent({
          tenantId,
          eventType: BillingEventType.TRIAL_ENDED,
          currentPlan: sub.planTier,
          details: 'Trial expirado — assinatura suspensa',
        }, supabase);
      }
      return 'Trial expirado — assinatura suspensa';
    }

    default:
      return `Evento ${eventType} recebido (sem ação automática)`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidTransition(
  current: SubscriptionStatus,
  next: SubscriptionStatus,
): boolean {
  return VALID_SUBSCRIPTION_TRANSITIONS[current]?.includes(next) ?? false;
}

function planDirection(from: PlanTier, to: PlanTier): 'upgrade' | 'downgrade' {
  const order: Record<PlanTier, number> = { starter: 0, pro: 1, agency: 2 };
  return order[to] > order[from] ? 'upgrade' : 'downgrade';
}

async function resolveTenantFromExternalId(
  externalCustomerId: string,
  supabase: SupabaseClient,
): Promise<string | undefined> {
  try {
    const rows = await supabase.select<{ tenant_id: string }>(
      SUBSCRIPTIONS_TABLE,
      {
        filters: [{
          column: 'external_customer_id',
          operator: 'eq',
          value: externalCustomerId,
        }],
        select: 'tenant_id',
        limit: 1,
      },
    );
    return rows[0]?.tenant_id;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

interface SubscriptionRow {
  id: string;
  tenant_id: string;
  plan_tier: string;
  status: string;
  provider: string;
  external_customer_id: string | null;
  external_subscription_id: string | null;
  external_plan_id: string | null;
  price_monthly_brl: number;
  started_at: string;
  trial_ends_at: string | null;
  next_billing_at: string | null;
  last_payment_at: string | null;
  canceled_at: string | null;
  previous_plan_tier: string | null;
  cancel_reason: string | null;
  provider_metadata: string | null;
  created_at: string;
  updated_at: string;
}

async function persistSubscription(
  supabase: SupabaseClient,
  sub: Subscription,
): Promise<void> {
  try {
    await supabase.insert(SUBSCRIPTIONS_TABLE, subscriptionToRow(sub));
  } catch (err) {
    logger.warn(`[SubscriptionManager] Failed to persist subscription ${sub.id}: ${err}`);
  }
}

async function updateSubscription(
  supabase: SupabaseClient,
  sub: Subscription,
): Promise<void> {
  try {
    await supabase.update(
      SUBSCRIPTIONS_TABLE,
      { column: 'id', operator: 'eq', value: sub.id },
      {
        plan_tier: sub.planTier,
        status: sub.status,
        price_monthly_brl: sub.priceMonthlyBRL,
        previous_plan_tier: sub.previousPlanTier ?? null,
        last_payment_at: sub.lastPaymentAt?.toISOString() ?? null,
        canceled_at: sub.canceledAt?.toISOString() ?? null,
        cancel_reason: sub.cancelReason ?? null,
        updated_at: sub.updatedAt.toISOString(),
      },
    );
  } catch (err) {
    logger.warn(`[SubscriptionManager] Failed to update subscription ${sub.id}: ${err}`);
  }
}

function subscriptionToRow(sub: Subscription): Record<string, unknown> {
  return {
    id: sub.id,
    tenant_id: sub.tenantId,
    plan_tier: sub.planTier,
    status: sub.status,
    provider: sub.provider,
    external_customer_id: sub.externalCustomerId ?? null,
    external_subscription_id: sub.externalSubscriptionId ?? null,
    external_plan_id: sub.externalPlanId ?? null,
    price_monthly_brl: sub.priceMonthlyBRL,
    started_at: sub.startedAt.toISOString(),
    trial_ends_at: sub.trialEndsAt?.toISOString() ?? null,
    next_billing_at: sub.nextBillingAt?.toISOString() ?? null,
    last_payment_at: sub.lastPaymentAt?.toISOString() ?? null,
    canceled_at: sub.canceledAt?.toISOString() ?? null,
    previous_plan_tier: sub.previousPlanTier ?? null,
    cancel_reason: sub.cancelReason ?? null,
    provider_metadata: sub.providerMetadata ? JSON.stringify(sub.providerMetadata) : null,
    created_at: sub.createdAt.toISOString(),
    updated_at: sub.updatedAt.toISOString(),
  };
}

function rowToSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    planTier: row.plan_tier as PlanTier,
    status: row.status as SubscriptionStatus,
    provider: row.provider as BillingProvider,
    externalCustomerId: row.external_customer_id ?? undefined,
    externalSubscriptionId: row.external_subscription_id ?? undefined,
    externalPlanId: row.external_plan_id ?? undefined,
    priceMonthlyBRL: row.price_monthly_brl,
    startedAt: new Date(row.started_at),
    trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at) : undefined,
    nextBillingAt: row.next_billing_at ? new Date(row.next_billing_at) : undefined,
    lastPaymentAt: row.last_payment_at ? new Date(row.last_payment_at) : undefined,
    canceledAt: row.canceled_at ? new Date(row.canceled_at) : undefined,
    previousPlanTier: row.previous_plan_tier as PlanTier | undefined,
    cancelReason: row.cancel_reason ?? undefined,
    providerMetadata: row.provider_metadata ? JSON.parse(row.provider_metadata) as Record<string, unknown> : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

async function persistWebhookEvent(
  supabase: SupabaseClient,
  event: PaymentWebhookEvent,
): Promise<void> {
  try {
    await supabase.upsert(WEBHOOK_EVENTS_TABLE, {
      id: event.id,
      provider: event.provider,
      event_type: event.eventType,
      external_event_id: event.externalEventId ?? null,
      tenant_id: event.tenantId ?? null,
      external_customer_id: event.externalCustomerId ?? null,
      raw_payload: JSON.stringify(event.rawPayload),
      processing_status: event.processingStatus,
      applied_action: event.appliedAction ?? null,
      processing_error: event.processingError ?? null,
      source_ip: event.sourceIp ?? null,
      headers: event.headers ? JSON.stringify(event.headers) : null,
      received_at: event.receivedAt.toISOString(),
      processed_at: event.processedAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.warn(`[SubscriptionManager] Failed to persist webhook event ${event.id}: ${err}`);
  }
}
