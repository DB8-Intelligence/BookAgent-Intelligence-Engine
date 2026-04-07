/**
 * Entity: Subscription / PaymentWebhookEvent / InvoiceEvent / PlanChangeRequest
 *
 * Camada de integração com gateway de pagamento.
 * Desacoplada do provider para permitir troca futura (Stripe, Asaas, etc.).
 *
 * Ciclo de vida da assinatura:
 *   trial → active → past_due → suspended → canceled
 *                  → upgraded / downgraded (lateral, mantém active)
 *                  → canceled → reactivated → active
 *
 * Persistência:
 *   - bookagent_subscriptions
 *   - bookagent_webhook_events
 *
 * Parte 76: Billing Gateway Integration
 */

import type { PlanTier } from '../../plans/plan-config.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Status da assinatura */
export enum SubscriptionStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  SUSPENDED = 'suspended',
  CANCELED = 'canceled',
}

/** Provider de billing suportado */
export enum BillingProvider {
  STRIPE = 'stripe',
  ASAAS = 'asaas',
  MANUAL = 'manual',
  NONE = 'none',
}

/** Tipo de evento de webhook do gateway */
export enum WebhookEventType {
  /** Assinatura criada */
  SUBSCRIPTION_CREATED = 'subscription.created',
  /** Assinatura atualizada (upgrade/downgrade) */
  SUBSCRIPTION_UPDATED = 'subscription.updated',
  /** Assinatura cancelada */
  SUBSCRIPTION_CANCELED = 'subscription.canceled',
  /** Assinatura reativada */
  SUBSCRIPTION_REACTIVATED = 'subscription.reactivated',
  /** Pagamento aprovado */
  PAYMENT_SUCCEEDED = 'payment.succeeded',
  /** Pagamento falhou */
  PAYMENT_FAILED = 'payment.failed',
  /** Invoice gerada */
  INVOICE_CREATED = 'invoice.created',
  /** Invoice paga */
  INVOICE_PAID = 'invoice.paid',
  /** Invoice vencida */
  INVOICE_OVERDUE = 'invoice.overdue',
  /** Trial expirado */
  TRIAL_EXPIRED = 'trial.expired',
  /** Reembolso */
  REFUND_ISSUED = 'refund.issued',
}

/** Status de processamento do webhook event */
export enum WebhookProcessingStatus {
  RECEIVED = 'received',
  PROCESSING = 'processing',
  APPLIED = 'applied',
  FAILED = 'failed',
  IGNORED = 'ignored',
}

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

/**
 * Assinatura de um tenant — link entre tenant e gateway de pagamento.
 * Persistido em bookagent_subscriptions.
 */
export interface Subscription {
  /** ID interno */
  id: string;

  /** ID do tenant */
  tenantId: string;

  /** Plano atual */
  planTier: PlanTier;

  /** Status da assinatura */
  status: SubscriptionStatus;

  /** Provider de billing */
  provider: BillingProvider;

  /** ID do customer no gateway externo */
  externalCustomerId?: string;

  /** ID da subscription no gateway externo */
  externalSubscriptionId?: string;

  /** ID do plano/price no gateway externo */
  externalPlanId?: string;

  /** Preço mensal em centavos BRL */
  priceMonthlyBRL: number;

  /** Data de início da assinatura */
  startedAt: Date;

  /** Data de expiração do trial (null se não trial) */
  trialEndsAt?: Date;

  /** Data do próximo billing */
  nextBillingAt?: Date;

  /** Data do último pagamento aprovado */
  lastPaymentAt?: Date;

  /** Data de cancelamento (se cancelada) */
  canceledAt?: Date;

  /** Plano anterior (se houve mudança) */
  previousPlanTier?: PlanTier;

  /** Motivo do cancelamento */
  cancelReason?: string;

  /** Metadados para sync com gateway */
  providerMetadata?: Record<string, unknown>;

  /** Criado em */
  createdAt: Date;

  /** Última atualização */
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Payment Webhook Event
// ---------------------------------------------------------------------------

/**
 * Evento de webhook recebido do gateway de pagamento.
 * Armazena payload bruto para auditabilidade total.
 * Persistido em bookagent_webhook_events.
 */
export interface PaymentWebhookEvent {
  /** ID interno */
  id: string;

  /** Provider de origem */
  provider: BillingProvider;

  /** Tipo do evento */
  eventType: WebhookEventType;

  /** ID do evento no gateway */
  externalEventId?: string;

  /** ID do tenant afetado (resolvido após processamento) */
  tenantId?: string;

  /** ID do customer no gateway */
  externalCustomerId?: string;

  /** Payload bruto recebido (JSON) */
  rawPayload: Record<string, unknown>;

  /** Status de processamento */
  processingStatus: WebhookProcessingStatus;

  /** Decisão aplicada (ex: "plan upgraded to pro", "subscription suspended") */
  appliedAction?: string;

  /** Erro de processamento (se falhou) */
  processingError?: string;

  /** IP de origem */
  sourceIp?: string;

  /** Headers relevantes (signature, etc.) */
  headers?: Record<string, string>;

  /** Recebido em */
  receivedAt: Date;

  /** Processado em */
  processedAt?: Date;
}

// ---------------------------------------------------------------------------
// Invoice Event
// ---------------------------------------------------------------------------

/**
 * Evento de invoice — para tracking financeiro.
 */
export interface InvoiceEvent {
  /** ID interno */
  id: string;

  /** ID do tenant */
  tenantId: string;

  /** ID da invoice no gateway */
  externalInvoiceId?: string;

  /** Plano cobrado */
  planTier: PlanTier;

  /** Valor em centavos BRL */
  amountBRL: number;

  /** Status */
  status: 'created' | 'paid' | 'overdue' | 'canceled' | 'refunded';

  /** URL da invoice (se disponível) */
  invoiceUrl?: string;

  /** Data de vencimento */
  dueAt: Date;

  /** Data de pagamento (se paga) */
  paidAt?: Date;

  /** Criado em */
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Plan Change Request
// ---------------------------------------------------------------------------

/**
 * Solicitação de mudança de plano — upgrade/downgrade.
 */
export interface PlanChangeRequest {
  /** ID do tenant */
  tenantId: string;

  /** Plano atual */
  fromPlan: PlanTier;

  /** Plano desejado */
  toPlan: PlanTier;

  /** Direção */
  direction: 'upgrade' | 'downgrade';

  /** Se deve aplicar imediatamente ou no próximo ciclo */
  immediate: boolean;

  /** ID do usuário que solicitou */
  requestedBy: string;

  /** Timestamp */
  requestedAt: Date;
}

// ---------------------------------------------------------------------------
// Transições válidas de status de assinatura
// ---------------------------------------------------------------------------

export const VALID_SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  [SubscriptionStatus.TRIAL]: [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.CANCELED,
    SubscriptionStatus.SUSPENDED,
  ],
  [SubscriptionStatus.ACTIVE]: [
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.CANCELED,
    SubscriptionStatus.SUSPENDED,
    SubscriptionStatus.ACTIVE, // upgrade/downgrade mantém active
  ],
  [SubscriptionStatus.PAST_DUE]: [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.SUSPENDED,
    SubscriptionStatus.CANCELED,
  ],
  [SubscriptionStatus.SUSPENDED]: [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.CANCELED,
  ],
  [SubscriptionStatus.CANCELED]: [
    SubscriptionStatus.ACTIVE, // reactivation
    SubscriptionStatus.TRIAL,  // new trial
  ],
};

/** Trial default em dias */
export const DEFAULT_TRIAL_DAYS = 7;

/** Dias de tolerância após falha de pagamento antes de suspender */
export const PAST_DUE_GRACE_DAYS = 7;
