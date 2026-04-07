/**
 * Stripe Billing Provider — Real Implementation
 *
 * Integração completa com Stripe para:
 *   - Criação de customers
 *   - Criação de subscriptions com trial
 *   - Upgrade/downgrade de planos
 *   - Cancelamento e reativação
 *   - Webhook signature verification
 *   - Event parsing
 *
 * Env vars:
 *   STRIPE_SECRET_KEY       — sk_test_... ou sk_live_...
 *   STRIPE_WEBHOOK_SECRET   — whsec_...
 *   STRIPE_PRICE_BASIC      — price_...
 *   STRIPE_PRICE_PRO        — price_...
 *   STRIPE_PRICE_BUSINESS   — price_...
 *
 * Parte 76 + 101: Billing Gateway Integration + SaaS Real
 */

import { BillingProvider, WebhookEventType } from '../../../domain/entities/subscription.js';
import type { PlanTier } from '../../../plans/plan-config.js';
import type {
  IBillingProvider,
  ProviderResult,
  CreateCustomerInput,
  CreateSubscriptionInput,
  ChangePlanInput,
  ParsedWebhookEvent,
} from '../billing-provider.js';
import { logger } from '../../../utils/logger.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getConfig() {
  return {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    priceIds: {
      basic: process.env.STRIPE_PRICE_BASIC ?? '',
      pro: process.env.STRIPE_PRICE_PRO ?? '',
      business: process.env.STRIPE_PRICE_BUSINESS ?? '',
    } as Record<string, string>,
  };
}

function getPriceId(tier: PlanTier): string {
  const cfg = getConfig();
  return cfg.priceIds[tier] ?? '';
}

// ---------------------------------------------------------------------------
// Stripe HTTP Client (no SDK dependency — uses fetch)
// ---------------------------------------------------------------------------

async function stripeRequest<T>(
  method: string,
  path: string,
  body?: Record<string, string>,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const cfg = getConfig();
  if (!cfg.secretKey) {
    return { ok: false, error: 'STRIPE_SECRET_KEY not configured' };
  }

  const url = `https://api.stripe.com/v1${path}`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${cfg.secretKey}`,
  };

  let reqBody: string | undefined;
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    reqBody = new URLSearchParams(body).toString();
  }

  try {
    const res = await fetch(url, { method, headers, body: reqBody });
    const json = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      const errObj = json['error'] as Record<string, unknown> | undefined;
      const errMsg = (errObj?.['message'] as string) ?? `Stripe ${res.status}`;
      return { ok: false, error: errMsg };
    }

    return { ok: true, data: json as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Provider Implementation
// ---------------------------------------------------------------------------

export class StripeBillingProvider implements IBillingProvider {
  readonly provider = BillingProvider.STRIPE;
  readonly name = 'Stripe';

  isConfigured(): boolean {
    const cfg = getConfig();
    return !!(cfg.secretKey);
  }

  // ── Create Customer ────────────────────────────────────────────────────

  async createCustomer(
    input: CreateCustomerInput,
  ): Promise<ProviderResult<{ customerId: string }>> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Stripe not configured' };
    }

    const params: Record<string, string> = {
      name: input.name,
      email: input.email,
      'metadata[tenantId]': input.tenantId,
    };
    if (input.phone) params['phone'] = input.phone;

    const res = await stripeRequest<Record<string, unknown>>('POST', '/customers', params);

    if (!res.ok || !res.data) {
      logger.error(`[Stripe] createCustomer failed: ${res.error}`);
      return { success: false, error: res.error };
    }

    const customerId = res.data['id'] as string;
    logger.info(`[Stripe] Customer created: ${customerId} for tenant ${input.tenantId}`);

    return {
      success: true,
      data: { customerId },
      externalId: customerId,
    };
  }

  // ── Create Subscription ────────────────────────────────────────────────

  async createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<ProviderResult<{ subscriptionId: string; planId: string; status: string }>> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Stripe not configured' };
    }

    const priceId = getPriceId(input.planTier);
    if (!priceId) {
      return { success: false, error: `No Stripe price configured for plan "${input.planTier}"` };
    }

    const params: Record<string, string> = {
      'customer': input.externalCustomerId,
      'items[0][price]': priceId,
      'metadata[planTier]': input.planTier,
    };

    if (input.trialDays && input.trialDays > 0) {
      params['trial_period_days'] = String(input.trialDays);
    }

    const res = await stripeRequest<Record<string, unknown>>('POST', '/subscriptions', params);

    if (!res.ok || !res.data) {
      logger.error(`[Stripe] createSubscription failed: ${res.error}`);
      return { success: false, error: res.error };
    }

    const subscriptionId = res.data['id'] as string;
    const status = res.data['status'] as string;

    logger.info(`[Stripe] Subscription created: ${subscriptionId} status=${status}`);

    return {
      success: true,
      data: { subscriptionId, planId: priceId, status },
      externalId: subscriptionId,
    };
  }

  // ── Cancel Subscription ────────────────────────────────────────────────

  async cancelSubscription(externalSubscriptionId: string): Promise<ProviderResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Stripe not configured' };
    }

    const res = await stripeRequest<Record<string, unknown>>(
      'DELETE',
      `/subscriptions/${externalSubscriptionId}`,
    );

    if (!res.ok) {
      logger.error(`[Stripe] cancelSubscription failed: ${res.error}`);
      return { success: false, error: res.error };
    }

    logger.info(`[Stripe] Subscription canceled: ${externalSubscriptionId}`);
    return { success: true, externalId: externalSubscriptionId };
  }

  // ── Change Plan ────────────────────────────────────────────────────────

  async changePlan(
    input: ChangePlanInput,
  ): Promise<ProviderResult<{ newPlanId: string }>> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Stripe not configured' };
    }

    const newPriceId = getPriceId(input.newPlanTier);
    if (!newPriceId) {
      return { success: false, error: `No Stripe price for plan "${input.newPlanTier}"` };
    }

    // First, get subscription to find the item ID
    const subRes = await stripeRequest<Record<string, unknown>>(
      'GET',
      `/subscriptions/${input.externalSubscriptionId}`,
    );

    if (!subRes.ok || !subRes.data) {
      return { success: false, error: subRes.error ?? 'Failed to fetch subscription' };
    }

    const items = subRes.data['items'] as Record<string, unknown> | undefined;
    const itemData = (items?.['data'] as Array<Record<string, unknown>>) ?? [];
    const firstItem = itemData[0];

    if (!firstItem) {
      return { success: false, error: 'No subscription items found' };
    }

    const itemId = firstItem['id'] as string;

    // Update the subscription item with new price
    const params: Record<string, string> = {
      [`items[0][id]`]: itemId,
      [`items[0][price]`]: newPriceId,
      'metadata[planTier]': input.newPlanTier,
    };

    if (input.immediate) {
      params['proration_behavior'] = 'create_prorations';
    } else {
      params['proration_behavior'] = 'none';
    }

    const res = await stripeRequest<Record<string, unknown>>(
      'POST',
      `/subscriptions/${input.externalSubscriptionId}`,
      params,
    );

    if (!res.ok) {
      logger.error(`[Stripe] changePlan failed: ${res.error}`);
      return { success: false, error: res.error };
    }

    logger.info(`[Stripe] Plan changed to ${input.newPlanTier} for ${input.externalSubscriptionId}`);

    return {
      success: true,
      data: { newPlanId: newPriceId },
      externalId: input.externalSubscriptionId,
    };
  }

  // ── Reactivate ─────────────────────────────────────────────────────────

  async reactivateSubscription(externalSubscriptionId: string): Promise<ProviderResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Stripe not configured' };
    }

    // In Stripe, reactivation = update with cancel_at_period_end = false
    const res = await stripeRequest<Record<string, unknown>>(
      'POST',
      `/subscriptions/${externalSubscriptionId}`,
      { 'cancel_at_period_end': 'false' },
    );

    if (!res.ok) {
      logger.error(`[Stripe] reactivateSubscription failed: ${res.error}`);
      return { success: false, error: res.error };
    }

    logger.info(`[Stripe] Subscription reactivated: ${externalSubscriptionId}`);
    return { success: true, externalId: externalSubscriptionId };
  }

  // ── Webhook Verification ───────────────────────────────────────────────

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const cfg = getConfig();
    if (!cfg.webhookSecret) return false;

    // Stripe signature format: t=timestamp,v1=signature
    // Simple HMAC-SHA256 verification without SDK
    try {
      const parts = signature.split(',');
      const tPart = parts.find((p) => p.startsWith('t='));
      const vPart = parts.find((p) => p.startsWith('v1='));

      if (!tPart || !vPart) return false;

      const timestamp = tPart.slice(2);
      const expectedSig = vPart.slice(3);

      // Build signed payload
      const signedPayload = `${timestamp}.${payload}`;

      // Use Node.js crypto for HMAC
      // Note: in production, import crypto at top level
      const crypto = require('crypto') as typeof import('crypto');
      const hmac = crypto.createHmac('sha256', cfg.webhookSecret);
      hmac.update(signedPayload);
      const computedSig = hmac.digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(expectedSig, 'hex'),
        Buffer.from(computedSig, 'hex'),
      );
    } catch (err) {
      logger.warn(`[Stripe] Webhook signature verification error: ${err}`);
      return false;
    }
  }

  // ── Parse Webhook Event ────────────────────────────────────────────────

  parseWebhookEvent(payload: Record<string, unknown>): ParsedWebhookEvent | null {
    const type = payload['type'] as string | undefined;
    const id = payload['id'] as string | undefined;

    if (!type || !id) return null;

    const data = payload['data'] as Record<string, unknown> | undefined;
    const obj = data?.['object'] as Record<string, unknown> | undefined;

    // Map Stripe event types to our WebhookEventType
    const eventType = mapStripeEventType(type);

    // Extract plan tier from metadata
    const metadata = obj?.['metadata'] as Record<string, unknown> | undefined;
    const planTier = metadata?.['planTier'] as PlanTier | undefined;

    // Extract amount (in centavos → BRL)
    const amountRaw = obj?.['amount_paid'] as number | undefined;
    const amountBRL = amountRaw ? amountRaw / 100 : undefined;

    return {
      eventType: eventType ?? type,
      externalEventId: id,
      externalCustomerId: (obj?.['customer'] as string) ?? undefined,
      externalSubscriptionId: (obj?.['subscription'] as string) ?? (obj?.['id'] as string) ?? undefined,
      planTier,
      amountBRL,
      status: (obj?.['status'] as string) ?? undefined,
      metadata: metadata ?? undefined,
    };
  }
}

// ---------------------------------------------------------------------------
// Stripe Event Type Mapping
// ---------------------------------------------------------------------------

function mapStripeEventType(stripeType: string): string | null {
  const map: Record<string, string> = {
    'customer.subscription.created': WebhookEventType.SUBSCRIPTION_CREATED,
    'customer.subscription.updated': WebhookEventType.SUBSCRIPTION_UPDATED,
    'customer.subscription.deleted': WebhookEventType.SUBSCRIPTION_CANCELED,
    'invoice.paid': WebhookEventType.PAYMENT_SUCCEEDED,
    'invoice.payment_failed': WebhookEventType.PAYMENT_FAILED,
    'invoice.created': WebhookEventType.INVOICE_CREATED,
    'customer.subscription.trial_will_end': WebhookEventType.TRIAL_EXPIRED,
  };
  return map[stripeType] ?? null;
}
