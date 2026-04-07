/**
 * Billing Provider Interface — Billing Gateway Integration
 *
 * Interface desacoplada para providers de pagamento.
 * Permite trocar Stripe/Asaas/outro sem alterar lógica de negócio.
 *
 * Cada provider implementa IBillingProvider e é registrado na factory.
 *
 * Parte 76: Billing Gateway Integration
 */

import type { PlanTier } from '../../plans/plan-config.js';
import type { Subscription } from '../../domain/entities/subscription.js';
import { BillingProvider } from '../../domain/entities/subscription.js';

// ---------------------------------------------------------------------------
// Provider Interface
// ---------------------------------------------------------------------------

/**
 * Resultado de operação do provider.
 */
export interface ProviderResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  externalId?: string;
}

/**
 * Dados para criação de customer no gateway.
 */
export interface CreateCustomerInput {
  tenantId: string;
  name: string;
  email: string;
  document?: string; // CPF/CNPJ
  phone?: string;
  metadata?: Record<string, string>;
}

/**
 * Dados para criação de assinatura no gateway.
 */
export interface CreateSubscriptionInput {
  externalCustomerId: string;
  planTier: PlanTier;
  trialDays?: number;
  metadata?: Record<string, string>;
}

/**
 * Dados para mudança de plano.
 */
export interface ChangePlanInput {
  externalSubscriptionId: string;
  newPlanTier: PlanTier;
  immediate: boolean;
}

/**
 * Interface que todo billing provider deve implementar.
 */
export interface IBillingProvider {
  /** Provider type */
  readonly provider: BillingProvider;

  /** Nome legível */
  readonly name: string;

  /** Verifica se está configurado (API keys presentes) */
  isConfigured(): boolean;

  /** Cria customer no gateway */
  createCustomer(input: CreateCustomerInput): Promise<ProviderResult<{ customerId: string }>>;

  /** Cria assinatura no gateway */
  createSubscription(input: CreateSubscriptionInput): Promise<ProviderResult<{
    subscriptionId: string;
    planId: string;
    status: string;
  }>>;

  /** Cancela assinatura */
  cancelSubscription(externalSubscriptionId: string): Promise<ProviderResult>;

  /** Muda plano da assinatura */
  changePlan(input: ChangePlanInput): Promise<ProviderResult<{ newPlanId: string }>>;

  /** Reativa assinatura cancelada */
  reactivateSubscription(externalSubscriptionId: string): Promise<ProviderResult>;

  /** Verifica assinatura do webhook (signature validation) */
  verifyWebhookSignature(payload: string, signature: string): boolean;

  /** Extrai evento normalizado do payload do webhook */
  parseWebhookEvent(payload: Record<string, unknown>): ParsedWebhookEvent | null;
}

/**
 * Evento de webhook normalizado — independente do provider.
 */
export interface ParsedWebhookEvent {
  eventType: string;
  externalEventId: string;
  externalCustomerId?: string;
  externalSubscriptionId?: string;
  planTier?: PlanTier;
  amountBRL?: number;
  status?: string;
  metadata?: Record<string, unknown>;
}
