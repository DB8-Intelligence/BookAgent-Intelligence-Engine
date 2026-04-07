/**
 * Manual Billing Provider — Billing Gateway Integration
 *
 * Provider para gestão manual de assinaturas (sem gateway externo).
 * Usado em ambiente dev, trials internos e gestão manual de clientes.
 *
 * Todas as operações são locais — não fazem chamadas externas.
 *
 * Parte 76: Billing Gateway Integration
 */

import { v4 as uuid } from 'uuid';

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

export class ManualBillingProvider implements IBillingProvider {
  readonly provider = BillingProvider.MANUAL;
  readonly name = 'Manual (local)';

  isConfigured(): boolean {
    return true; // Always available
  }

  async createCustomer(input: CreateCustomerInput): Promise<ProviderResult<{ customerId: string }>> {
    const customerId = `manual_${input.tenantId}`;
    logger.info(`[ManualProvider] Customer created: ${customerId}`);
    return { success: true, data: { customerId }, externalId: customerId };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<ProviderResult<{
    subscriptionId: string;
    planId: string;
    status: string;
  }>> {
    const subscriptionId = `manual_sub_${uuid().substring(0, 8)}`;
    const planId = `manual_plan_${input.planTier}`;
    const status = input.trialDays ? 'trial' : 'active';

    logger.info(
      `[ManualProvider] Subscription created: ${subscriptionId} ` +
      `plan=${input.planTier} status=${status}`,
    );

    return {
      success: true,
      data: { subscriptionId, planId, status },
      externalId: subscriptionId,
    };
  }

  async cancelSubscription(externalSubscriptionId: string): Promise<ProviderResult> {
    logger.info(`[ManualProvider] Subscription canceled: ${externalSubscriptionId}`);
    return { success: true };
  }

  async changePlan(input: ChangePlanInput): Promise<ProviderResult<{ newPlanId: string }>> {
    const newPlanId = `manual_plan_${input.newPlanTier}`;
    logger.info(
      `[ManualProvider] Plan changed: ${input.externalSubscriptionId} → ${input.newPlanTier}`,
    );
    return { success: true, data: { newPlanId } };
  }

  async reactivateSubscription(externalSubscriptionId: string): Promise<ProviderResult> {
    logger.info(`[ManualProvider] Subscription reactivated: ${externalSubscriptionId}`);
    return { success: true };
  }

  verifyWebhookSignature(_payload: string, _signature: string): boolean {
    return true; // Manual provider accepts all
  }

  parseWebhookEvent(payload: Record<string, unknown>): ParsedWebhookEvent | null {
    // Manual events use our internal format
    if (typeof payload.eventType !== 'string') return null;

    return {
      eventType: payload.eventType,
      externalEventId: (payload.eventId as string) ?? uuid(),
      externalCustomerId: payload.customerId as string | undefined,
      externalSubscriptionId: payload.subscriptionId as string | undefined,
      planTier: payload.planTier as ParsedWebhookEvent['planTier'],
      amountBRL: payload.amountBRL as number | undefined,
      status: payload.status as string | undefined,
      metadata: payload.metadata as Record<string, unknown> | undefined,
    };
  }
}
