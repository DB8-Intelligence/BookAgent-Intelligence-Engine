/**
 * Kiwify Billing Provider — BookAgent Intelligence Engine
 *
 * Integração com Kiwify para processamento de assinaturas.
 *
 * Eventos tratados:
 *   compra_aprovada        → ativar plano
 *   compra_reembolsada     → cancelar plano → reverter para free
 *   subscription_canceled  → cancelar assinatura recorrente
 *   subscription_renewed   → renovar/reativar plano
 *   chargeback             → cancelar plano
 *
 * Mapeamento de produtos Kiwify → planos BookAgent:
 *   Configurado via env vars KIWIFY_PRODUCT_ID_<PLANO>
 *   ou detectado pelo preço pago (fallback).
 *
 * Variáveis de ambiente:
 *   KIWIFY_WEBHOOK_TOKEN       — token de validação (campo "token" no webhook)
 *   KIWIFY_PRODUCT_ID_STARTER  — ID do produto Starter (R$47)
 *   KIWIFY_PRODUCT_ID_PRO      — ID do produto Pro (R$97)
 *   KIWIFY_PRODUCT_ID_AGENCY   — ID do produto Agência (R$247)
 */

import type {
  IBillingProvider,
  ProviderResult,
  CreateCustomerInput,
  CreateSubscriptionInput,
  ChangePlanInput,
  ParsedWebhookEvent,
} from '../billing-provider.js';
import { BillingProvider } from '../../../domain/entities/subscription.js';
import type { PlanTier } from '../../../plans/plan-config.js';
import { logger } from '../../../utils/logger.js';

// ---------------------------------------------------------------------------
// Types — Kiwify webhook payload
// ---------------------------------------------------------------------------

interface KiwifyWebhookPayload {
  order_id: string;
  order_ref?: string;
  order_status: string;          // 'paid' | 'refunded' | 'chargedback' | 'waiting_payment'
  payment_method?: string;
  store_id?: string;
  installments?: number;
  // Produto
  product?: {
    id: string;
    name?: string;
  };
  // Comprador
  Customer?: {
    full_name?: string;
    email?: string;
    mobile?: string;
    CPF?: string;
  };
  // Assinatura (presente em eventos de subscription)
  Subscription?: {
    id?: string;
    status?: string;             // 'active' | 'cancelled' | 'overdue'
    current_period_end?: string;
    plan?: {
      id?: string;
      name?: string;
    };
  };
  // Preço pago
  Amount?: number;               // em centavos
  // Token de validação (enviado pelo Kiwify no body)
  token?: string;
  // Evento
  webhook_event_type?: string;   // 'compra_aprovada' | 'subscription_canceled' | etc.
}

// ---------------------------------------------------------------------------
// Mapeamento preço → plano (fallback quando product_id não configurado)
// ---------------------------------------------------------------------------

const PRICE_TO_PLAN: { maxBRL: number; plan: PlanTier }[] = [
  { maxBRL: 60,   plan: 'starter' }, // R$47 → starter
  { maxBRL: 130,  plan: 'pro'     }, // R$97 → pro
  { maxBRL: 9999, plan: 'agency'  }, // R$247 → agency
];

// ---------------------------------------------------------------------------
// Kiwify Provider
// ---------------------------------------------------------------------------

export class KiwifyBillingProvider implements IBillingProvider {
  readonly provider = BillingProvider.KIWIFY;
  readonly name = 'Kiwify';

  isConfigured(): boolean {
    return !!(process.env.KIWIFY_WEBHOOK_TOKEN || process.env.KIWIFY_PRODUCT_ID_STARTER);
  }

  // -------------------------------------------------------------------------
  // Webhook validation
  // -------------------------------------------------------------------------

  verifyWebhookSignature(rawBody: string, tokenHeader: string): boolean {
    const expectedToken = process.env.KIWIFY_WEBHOOK_TOKEN;
    if (!expectedToken) {
      logger.warn('[KiwifyProvider] KIWIFY_WEBHOOK_TOKEN não configurado — aceitando sem validação');
      return true;
    }

    // Kiwify envia o token no campo "token" do body JSON
    try {
      const body = JSON.parse(rawBody) as KiwifyWebhookPayload;
      if (body.token && body.token === expectedToken) return true;
    } catch {
      // ignora parse error
    }

    // Fallback: compara com header se enviado
    if (tokenHeader && tokenHeader === expectedToken) return true;

    logger.warn('[KiwifyProvider] Token de webhook inválido');
    return false;
  }

  // -------------------------------------------------------------------------
  // Parse webhook event
  // -------------------------------------------------------------------------

  parseWebhookEvent(payload: Record<string, unknown>): ParsedWebhookEvent | null {
    const kw = payload as unknown as KiwifyWebhookPayload;

    const eventType = kw.webhook_event_type ?? kw.order_status;
    const orderId   = kw.order_id;
    const email     = kw.Customer?.email ?? undefined;
    const phone     = kw.Customer?.mobile ?? null;
    const productId = kw.product?.id ?? null;
    const subId     = kw.Subscription?.id ?? null;
    const amountBRL = kw.Amount ? kw.Amount / 100 : undefined;

    if (!eventType || !orderId) {
      logger.warn('[KiwifyProvider] Payload sem event_type ou order_id — ignorando');
      return null;
    }

    // Determina o plano baseado no product_id ou no preço
    const planTier = this.resolvePlanTier(productId, amountBRL);

    // Mapeia evento Kiwify → evento interno BookAgent
    let mappedEvent: ParsedWebhookEvent['eventType'] | null = null;

    switch (eventType) {
      case 'compra_aprovada':
      case 'paid':
      case 'subscription_renewed':
        mappedEvent = 'subscription.created';
        break;

      case 'compra_reembolsada':
      case 'refunded':
      case 'subscription_canceled':
      case 'chargeback':
      case 'chargedback':
        mappedEvent = 'subscription.canceled';
        break;

      case 'subscription_late':
        mappedEvent = 'subscription.updated';
        break;

      default:
        logger.info(`[KiwifyProvider] Evento não tratado: ${eventType}`);
        return null;
    }

    return {
      eventType:              mappedEvent,
      externalEventId:        orderId,
      externalCustomerId:     email,
      externalSubscriptionId: subId ?? orderId,
      planTier,
      amountBRL,
      metadata: {
        buyerPhone: phone,
        buyerName:  kw.Customer?.full_name,
        productId,
        kiwifyEvent: eventType,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Resolve plano pelo product_id ou preço
  // -------------------------------------------------------------------------

  private resolvePlanTier(productId: string | null, amountBRL?: number): PlanTier {
    // 1. Tenta pelo ID do produto (configurado via env)
    const ids = {
      starter: process.env.KIWIFY_PRODUCT_ID_STARTER,
      pro:     process.env.KIWIFY_PRODUCT_ID_PRO,
      agency:  process.env.KIWIFY_PRODUCT_ID_AGENCY,
    };

    if (productId) {
      if (ids.starter && productId === ids.starter) return 'starter';
      if (ids.pro     && productId === ids.pro)     return 'pro';
      if (ids.agency  && productId === ids.agency)  return 'agency';
    }

    // 2. Fallback pelo preço pago
    if (amountBRL) {
      for (const { maxBRL, plan } of PRICE_TO_PLAN) {
        if (amountBRL <= maxBRL) return plan;
      }
    }

    logger.warn(`[KiwifyProvider] Não foi possível determinar plano para product=${productId}, amount=${amountBRL} — usando starter`);
    return 'starter';
  }

  // -------------------------------------------------------------------------
  // Métodos não usados diretamente (Kiwify não tem API de cobrança programática)
  // -------------------------------------------------------------------------

  async createCustomer(_input: CreateCustomerInput): Promise<ProviderResult<{ customerId: string }>> {
    return { success: false, error: 'Kiwify não suporta criação de customer via API' };
  }

  async createSubscription(_input: CreateSubscriptionInput): Promise<ProviderResult<{ subscriptionId: string; planId: string; status: string }>> {
    return { success: false, error: 'Kiwify não suporta criação de subscription via API' };
  }

  async cancelSubscription(_subscriptionId: string): Promise<ProviderResult> {
    return { success: false, error: 'Kiwify não suporta cancelamento via API' };
  }

  async changePlan(_input: ChangePlanInput): Promise<ProviderResult<{ newPlanId: string }>> {
    return { success: false, error: 'Kiwify não suporta troca de plano via API' };
  }

  async reactivateSubscription(_subscriptionId: string): Promise<ProviderResult> {
    return { success: false, error: 'Kiwify não suporta reativação via API' };
  }
}
