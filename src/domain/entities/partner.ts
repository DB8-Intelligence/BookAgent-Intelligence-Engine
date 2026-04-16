/**
 * Partner, Affiliate & API Key — Domain Entities
 *
 * Modela parceiros, afiliados, API keys e integrações
 * para distribuição e escala do BookAgent.
 *
 * Persistência:
 *   - bookagent_partners
 *   - bookagent_api_keys
 *   - bookagent_referrals
 *   - bookagent_integration_webhooks
 *
 * Parte 103: Escala + API + Parcerias
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Tipo de parceiro. */
export enum PartnerType {
  AGENCY       = 'agency',
  BROKERAGE    = 'brokerage',
  AFFILIATE    = 'affiliate',
  WHITE_LABEL  = 'white_label',
  INTEGRATOR   = 'integrator',
}

/** Status do parceiro. */
export enum PartnerStatus {
  PENDING   = 'pending',
  ACTIVE    = 'active',
  SUSPENDED = 'suspended',
  CHURNED   = 'churned',
}

/** Tipo de comissão. */
export enum CommissionType {
  PERCENTAGE    = 'percentage',
  FIXED_MONTHLY = 'fixed_monthly',
  PER_SIGNUP    = 'per_signup',
  REVENUE_SHARE = 'revenue_share',
}

/** Status do referral. */
export enum ReferralStatus {
  CLICKED    = 'clicked',
  SIGNED_UP  = 'signed_up',
  CONVERTED  = 'converted',
  CHURNED    = 'churned',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Parceiro ou afiliado. */
export interface Partner {
  id: string;
  tenantId: string;
  type: PartnerType;
  status: PartnerStatus;
  name: string;
  contactEmail: string;
  contactPhone: string | null;
  /** Código único de referral (ex: "parceiro-abc") */
  referralCode: string;
  /** Configuração de comissão */
  commission: CommissionConfig;
  /** Total de referrals convertidos */
  totalReferrals: number;
  /** Receita total gerada pelos referrals */
  totalRevenueBrl: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Configuração de comissão do parceiro. */
export interface CommissionConfig {
  type: CommissionType;
  /** Percentual (0–100) ou valor fixo em centavos BRL */
  value: number;
  /** Duração em meses (0 = vitalício) */
  durationMonths: number;
}

/** API Key para acesso programático. */
export interface ApiKeyRecord {
  id: string;
  tenantId: string;
  /** Hash SHA-256 da key (nunca armazena plain text) */
  keyHash: string;
  /** Prefixo visível para identificação (ex: "ba_live_abc1") */
  keyPrefix: string;
  name: string;
  isActive: boolean;
  planTier: string;
  /** Rate limits por minuto */
  rateLimitPerMinute: number;
  /** Total de requests feitos */
  totalRequests: number;
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}

/** Referral tracking. */
export interface Referral {
  id: string;
  partnerId: string;
  referralCode: string;
  /** Tenant que foi referido */
  referredTenantId: string | null;
  status: ReferralStatus;
  /** IP/user agent para dedup */
  sourceIp: string | null;
  /** Plan tier que converteu */
  convertedPlan: string | null;
  /** Valor da primeira cobrança em centavos BRL */
  firstPaymentBrl: number | null;
  clickedAt: string;
  signedUpAt: string | null;
  convertedAt: string | null;
}

/** Webhook de integração com sistema externo. */
export interface IntegrationWebhook {
  id: string;
  tenantId: string;
  /** URL do webhook */
  url: string;
  /** Eventos que disparam este webhook */
  events: string[];
  /** Secret para assinatura HMAC */
  secret: string;
  isActive: boolean;
  /** Último status HTTP retornado */
  lastStatusCode: number | null;
  lastTriggeredAt: string | null;
  failureCount: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  [PartnerType.AGENCY]:      'Agency',
  [PartnerType.BROKERAGE]:   'Brokerage',
  [PartnerType.AFFILIATE]:   'Affiliate',
  [PartnerType.WHITE_LABEL]: 'White Label',
  [PartnerType.INTEGRATOR]:  'Integrator',
};

export const DEFAULT_COMMISSIONS: Record<PartnerType, CommissionConfig> = {
  [PartnerType.AGENCY]:      { type: CommissionType.REVENUE_SHARE, value: 20, durationMonths: 12 },
  [PartnerType.BROKERAGE]:   { type: CommissionType.PERCENTAGE, value: 15, durationMonths: 6 },
  [PartnerType.AFFILIATE]:   { type: CommissionType.PER_SIGNUP, value: 5000, durationMonths: 0 },
  [PartnerType.WHITE_LABEL]: { type: CommissionType.REVENUE_SHARE, value: 30, durationMonths: 0 },
  [PartnerType.INTEGRATOR]:  { type: CommissionType.PERCENTAGE, value: 10, durationMonths: 12 },
};

/** Eventos disponíveis para webhook de integração. */
export const WEBHOOK_EVENTS = [
  'job.created',
  'job.completed',
  'job.failed',
  'artifact.generated',
  'publication.published',
  'campaign.completed',
  'subscription.created',
  'subscription.canceled',
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number];
