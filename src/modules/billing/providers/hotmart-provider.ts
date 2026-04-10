/**
 * Hotmart Billing Provider — BookAgent Intelligence Engine
 *
 * Integração com Hotmart para processamento de assinaturas no mercado BR.
 *
 * Eventos tratados:
 *   PURCHASE_APPROVED      → ativar plano
 *   PURCHASE_REFUNDED      → cancelar plano + reverter para free
 *   PURCHASE_CANCELED      → cancelar plano
 *   SUBSCRIPTION_CANCELLATION → cancelar assinatura recorrente
 *
 * Mapeamento de produtos Hotmart → planos BookAgent:
 *   Configurado via env vars HOTMART_PRODUCT_ID_<PLANO>
 *   ou detectado pelo preço pago (fallback).
 *
 * Variáveis de ambiente:
 *   HOTMART_API_KEY            — client_id para API Hotmart
 *   HOTMART_API_SECRET         — client_secret
 *   HOTMART_WEBHOOK_HOTTOK     — token de validação de webhooks (hottok)
 *   HOTMART_PRODUCT_ID_BASIC   — ID do produto Básico (R$97)
 *   HOTMART_PRODUCT_ID_PRO     — ID do produto PRO (R$397)
 *   HOTMART_PRODUCT_ID_MAX     — ID do produto MAX (R$697)
 *
 * Parte 76+ (revisão): Hotmart Provider real
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
// Types — Hotmart webhook payload (simplificado)
// ---------------------------------------------------------------------------

interface HotmartWebhookPayload {
  event: string;
  version: string;
  creation_date: number;
  data: {
    purchase?: {
      transaction?: string;
      approved_date?: number;
      status?: string;
      price?: { value: number; currency_code: string };
      hottok?: string;
    };
    product?: {
      id: number;
      name?: string;
    };
    buyer?: {
      email?: string;
      name?: string;
      phone?: string;
    };
    subscription?: {
      subscriber_code?: string;
      status?: string;
      plan?: { id: string; name?: string };
    };
  };
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getConfig() {
  return {
    apiKey: process.env.HOTMART_API_KEY ?? '',
    apiSecret: process.env.HOTMART_API_SECRET ?? '',
    hottok: process.env.HOTMART_WEBHOOK_HOTTOK ?? '',
    productIds: {
      starter: process.env.HOTMART_PRODUCT_ID_STARTER ?? '',
      basico:  process.env.HOTMART_PRODUCT_ID_BASIC   ?? '',
      pro:     process.env.HOTMART_PRODUCT_ID_PRO     ?? '',
      max:     process.env.HOTMART_PRODUCT_ID_MAX     ?? '',
    },
  };
}

// Mapeamento preço → plano (fallback quando product_id não está configurado)
const PRICE_TO_PLAN: Array<{ maxBRL: number; plan: PlanTier }> = [
  { maxBRL: 150,  plan: 'starter' },   // R$97 → basic
  { maxBRL: 300,  plan: 'starter' },   // R$197 → basic (básico)
  { maxBRL: 500,  plan: 'pro' },     // R$397 → pro
  { maxBRL: 9999, plan: 'agency' },// R$697 → business (max)
];

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class HotmartBillingProvider implements IBillingProvider {
  readonly provider = BillingProvider.HOTMART;
  readonly name = 'Hotmart';

  isConfigured(): boolean {
    const cfg = getConfig();
    return !!(cfg.hottok || cfg.apiKey);
  }

  // -------------------------------------------------------------------------
  // createCustomer — Hotmart não tem API de criação de customer
  // O customer é criado no checkout pelo próprio comprador
  // -------------------------------------------------------------------------
  async createCustomer(input: CreateCustomerInput): Promise<ProviderResult<{ customerId: string }>> {
    logger.info(`[HotmartProvider] createCustomer: ${input.email} — Hotmart gerencia checkout`);
    return {
      success: true,
      data: { customerId: input.email }, // usa email como ID externo
    };
  }

  // -------------------------------------------------------------------------
  // createSubscription — direcionar para página de checkout Hotmart
  // -------------------------------------------------------------------------
  async createSubscription(input: CreateSubscriptionInput): Promise<ProviderResult<{
    subscriptionId: string;
    planId: string;
    status: string;
  }>> {
    const cfg = getConfig();
    const productId = cfg.productIds[input.planTier as keyof typeof cfg.productIds] ?? '';

    if (!productId) {
      return {
        success: false,
        error: `HOTMART_PRODUCT_ID_${input.planTier.toUpperCase()} não configurado`,
      };
    }

    const checkoutUrl = `https://pay.hotmart.com/${productId}?email=${input.externalCustomerId}`;
    logger.info(`[HotmartProvider] Checkout URL: ${checkoutUrl}`);

    return {
      success: true,
      data: {
        subscriptionId: `hotmart:pending:${productId}`,
        planId: productId,
        status: 'pending_checkout',
      },
    };
  }

  // -------------------------------------------------------------------------
  // cancelSubscription — via API Hotmart (requires token)
  // -------------------------------------------------------------------------
  async cancelSubscription(externalSubscriptionId: string): Promise<ProviderResult> {
    const cfg = getConfig();

    if (!cfg.apiKey || !cfg.apiSecret) {
      logger.warn('[HotmartProvider] cancelSubscription: sem credenciais API — cancelamento manual');
      return {
        success: false,
        error: 'Cancelamento manual necessário — configure HOTMART_API_KEY e HOTMART_API_SECRET',
      };
    }

    try {
      const token = await this.getAccessToken(cfg.apiKey, cfg.apiSecret);

      const res = await fetch(
        `https://developers.hotmart.com/payments/api/v1/subscriptions/${externalSubscriptionId}/cancel`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (res.ok) {
        logger.info(`[HotmartProvider] Assinatura cancelada: ${externalSubscriptionId}`);
        return { success: true };
      }

      return { success: false, error: `Hotmart API HTTP ${res.status}` };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // -------------------------------------------------------------------------
  // changePlan — Hotmart não suporta downgrade/upgrade via API diretamente
  // Orientar usuário a cancelar e recomprar
  // -------------------------------------------------------------------------
  async changePlan(input: ChangePlanInput): Promise<ProviderResult<{ newPlanId: string }>> {
    const cfg = getConfig();
    const newProductId = cfg.productIds[input.newPlanTier as keyof typeof cfg.productIds] ?? '';

    logger.info(`[HotmartProvider] changePlan: ${input.newPlanTier} — cancela e redireciona`);

    return {
      success: true,
      data: { newPlanId: newProductId || input.newPlanTier },
    };
  }

  // -------------------------------------------------------------------------
  // reactivateSubscription
  // -------------------------------------------------------------------------
  async reactivateSubscription(externalSubscriptionId: string): Promise<ProviderResult> {
    logger.info(`[HotmartProvider] reactivate: ${externalSubscriptionId}`);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // verifyWebhookSignature — valida via hottok
  // -------------------------------------------------------------------------
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const cfg = getConfig();

    if (!cfg.hottok) {
      logger.warn('[HotmartProvider] HOTMART_WEBHOOK_HOTTOK não configurado — aceitando webhook');
      return true;
    }

    // Hotmart envia o hottok no header X-Hotmart-Hottok ou no body como data.purchase.hottok
    if (signature === cfg.hottok) {
      return true;
    }

    try {
      const parsed = JSON.parse(payload) as HotmartWebhookPayload;
      return parsed?.data?.purchase?.hottok === cfg.hottok;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // parseWebhookEvent — normaliza payload Hotmart → ParsedWebhookEvent
  // -------------------------------------------------------------------------
  parseWebhookEvent(payload: Record<string, unknown>): ParsedWebhookEvent | null {
    try {
      const hm = payload as unknown as HotmartWebhookPayload;
      const event = hm.event ?? '';

      if (!event) return null;

      const productId = String(hm.data?.product?.id ?? '');
      const subscriberCode = hm.data?.subscription?.subscriber_code ?? hm.data?.purchase?.transaction ?? '';
      const buyerEmail = hm.data?.buyer?.email ?? '';
      const priceBRL = hm.data?.purchase?.price?.value ?? 0;

      // Resolver plano a partir do product_id configurado ou pelo preço
      const planTier = this.resolvePlan(productId, priceBRL);

      // Normalizar evento
      const eventType = this.normalizeEventType(event);
      if (!eventType) {
        logger.debug(`[HotmartProvider] Evento ignorado: ${event}`);
        return null;
      }

      logger.info(
        `[HotmartProvider] Webhook: event=${event} → ${eventType} | plan=${planTier} | sub=${subscriberCode}`,
      );

      return {
        eventType,
        externalEventId: `hotmart:${event}:${subscriberCode}:${hm.creation_date ?? Date.now()}`,
        externalCustomerId: buyerEmail,
        externalSubscriptionId: subscriberCode,
        planTier,
        amountBRL: Math.round(priceBRL * 100), // centavos
        status: hm.data?.subscription?.status ?? hm.data?.purchase?.status ?? 'unknown',
        metadata: {
          productId,
          buyerName: hm.data?.buyer?.name,
          buyerPhone: hm.data?.buyer?.phone,
          hotmartEvent: event,
        },
      };
    } catch (err) {
      logger.error(`[HotmartProvider] parseWebhookEvent error: ${err}`);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Resolve PlanTier pelo product_id configurado ou pelo valor pago */
  private resolvePlan(productId: string, priceBRL: number): PlanTier {
    const cfg = getConfig();
    const ids = cfg.productIds;

    if (productId) {
      if (ids.max     && productId === ids.max)     return 'agency';
      if (ids.pro     && productId === ids.pro)     return 'pro';
      if (ids.basico  && productId === ids.basico)  return 'starter';
      if (ids.starter && productId === ids.starter) return 'starter';
    }

    // Fallback: detectar pelo preço
    for (const { maxBRL, plan } of PRICE_TO_PLAN) {
      if (priceBRL <= maxBRL) return plan;
    }
    return 'starter';
  }

  /** Mapeia eventos Hotmart para WebhookEventType canônico */
  private normalizeEventType(hotmartEvent: string): string | null {
    const map: Record<string, string> = {
      'PURCHASE_APPROVED':          'subscription.created',
      'PURCHASE_COMPLETE':          'subscription.created',
      'PURCHASE_BILLET_PRINTED':    'subscription.created', // boleto impresso — aguardando
      'PURCHASE_REFUNDED':          'subscription.canceled',
      'PURCHASE_CANCELED':          'subscription.canceled',
      'PURCHASE_CHARGEBACK':        'subscription.canceled',
      'SUBSCRIPTION_CANCELLATION':  'subscription.canceled',
      'PURCHASE_DELAYED':           'subscription.updated',
      'PURCHASE_PROTEST':           'subscription.updated',
    };
    return map[hotmartEvent] ?? null;
  }

  /** Obtém access token OAuth2 da Hotmart API */
  private async getAccessToken(clientId: string, clientSecret: string): Promise<string> {
    const res = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) throw new Error(`Hotmart OAuth falhou: HTTP ${res.status}`);
    const data = await res.json() as { access_token: string };
    return data.access_token;
  }
}
