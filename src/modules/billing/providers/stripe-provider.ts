/**
 * Stripe Billing Provider — Billing Gateway Integration
 *
 * Adapter preparado para integração com Stripe.
 * Env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 *
 * Status: Stub estrutural — pronto para implementação real.
 * Implementação real requer: npm install stripe
 *
 * Parte 76: Billing Gateway Integration
 */

import { BillingProvider } from '../../../domain/entities/subscription.js';
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
    },
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class StripeBillingProvider implements IBillingProvider {
  readonly provider = BillingProvider.STRIPE;
  readonly name = 'Stripe';

  isConfigured(): boolean {
    const cfg = getConfig();
    return !!(cfg.secretKey && cfg.webhookSecret);
  }

  async createCustomer(input: CreateCustomerInput): Promise<ProviderResult<{ customerId: string }>> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Stripe not configured' };
    }

    // TODO: Implement with stripe.customers.create()
    logger.info(`[StripeProvider] createCustomer stub: ${input.tenantId}`);
    return {
      success: false,
      error: 'Stripe integration not yet implemented — use BILLING_PROVIDER=manual',
    };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<ProviderResult<{
    subscriptionId: string;
    planId: string;
    status: string;
  }>> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Stripe not configured' };
    }

    // TODO: Implement with stripe.subscriptions.create()
    logger.info(`[StripeProvider] createSubscription stub: ${input.externalCustomerId}`);
    return {
      success: false,
      error: 'Stripe integration not yet implemented',
    };
  }

  async cancelSubscription(externalSubscriptionId: string): Promise<ProviderResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Stripe not configured' };
    }

    // TODO: stripe.subscriptions.cancel()
    logger.info(`[StripeProvider] cancelSubscription stub: ${externalSubscriptionId}`);
    return { success: false, error: 'Not yet implemented' };
  }

  async changePlan(input: ChangePlanInput): Promise<ProviderResult<{ newPlanId: string }>> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Stripe not configured' };
    }

    // TODO: stripe.subscriptions.update() with new price
    logger.info(`[StripeProvider] changePlan stub: ${input.externalSubscriptionId}`);
    return { success: false, error: 'Not yet implemented' };
  }

  async reactivateSubscription(externalSubscriptionId: string): Promise<ProviderResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Stripe not configured' };
    }

    logger.info(`[StripeProvider] reactivateSubscription stub: ${externalSubscriptionId}`);
    return { success: false, error: 'Not yet implemented' };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const cfg = getConfig();
    if (!cfg.webhookSecret) return false;

    // TODO: stripe.webhooks.constructEvent(payload, signature, cfg.webhookSecret)
    logger.warn('[StripeProvider] Webhook signature verification not yet implemented');
    return false;
  }

  parseWebhookEvent(payload: Record<string, unknown>): ParsedWebhookEvent | null {
    // Stripe event structure: { id, type, data: { object: {...} } }
    const type = payload.type as string | undefined;
    const id = payload.id as string | undefined;

    if (!type || !id) return null;

    const data = payload.data as Record<string, unknown> | undefined;
    const obj = data?.object as Record<string, unknown> | undefined;

    return {
      eventType: type,
      externalEventId: id,
      externalCustomerId: obj?.customer as string | undefined,
      externalSubscriptionId: obj?.id as string | undefined,
      status: obj?.status as string | undefined,
      metadata: obj?.metadata as Record<string, unknown> | undefined,
    };
  }
}
