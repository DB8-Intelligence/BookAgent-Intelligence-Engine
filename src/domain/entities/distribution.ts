/**
 * Distribution & Monetization — Domain Entities
 *
 * Modela canais de distribuição, programas de afiliados,
 * configurações white-label e modelo de monetização API.
 *
 * Persistência:
 *   - bookagent_distribution_channels
 *   - bookagent_affiliate_payouts
 *   - bookagent_white_label_configs
 *   - bookagent_api_invoices
 *
 * Parte 103: Escala — Distribuição + Monetização
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum DistributionChannelType {
  DIRECT_SAAS   = 'direct_saas',
  API_USAGE     = 'api_usage',
  WHITE_LABEL   = 'white_label',
  AFFILIATE     = 'affiliate',
  PARTNER_RESALE = 'partner_resale',
  MARKETPLACE   = 'marketplace',
}

export enum MonetizationModel {
  SUBSCRIPTION   = 'subscription',
  PAY_PER_USE    = 'pay_per_use',
  REVENUE_SHARE  = 'revenue_share',
  LICENSE        = 'license',
  FREEMIUM       = 'freemium',
}

export enum PayoutStatus {
  PENDING   = 'pending',
  APPROVED  = 'approved',
  PAID      = 'paid',
  REJECTED  = 'rejected',
}

export enum WhiteLabelStatus {
  ACTIVE   = 'active',
  INACTIVE = 'inactive',
  TRIAL    = 'trial',
}

export enum ApiUsageTier {
  FREE       = 'free',
  STARTER    = 'starter',
  GROWTH     = 'growth',
  ENTERPRISE = 'enterprise',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Canal de distribuição do produto. */
export interface DistributionChannel {
  id: string;
  type: DistributionChannelType;
  name: string;
  model: MonetizationModel;
  isActive: boolean;
  /** Receita acumulada (centavos BRL) */
  totalRevenueBrl: number;
  /** Clientes ativos no canal */
  activeCustomers: number;
  /** Configuração do canal */
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Pagamento a afiliado/parceiro. */
export interface AffiliatePayout {
  id: string;
  partnerId: string;
  tenantId: string;
  /** Referral que gerou o payout */
  referralId: string | null;
  amountBrl: number;
  status: PayoutStatus;
  /** Período do payout */
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Configuração white-label para parceiro. */
export interface WhiteLabelConfig {
  id: string;
  partnerId: string;
  tenantId: string;
  status: WhiteLabelStatus;
  /** Branding do parceiro */
  branding: WhiteLabelBranding;
  /** Domínio customizado */
  customDomain: string | null;
  /** Plano disponível para clientes do parceiro */
  allowedPlans: string[];
  /** Limites do parceiro */
  maxEndCustomers: number;
  currentEndCustomers: number;
  createdAt: string;
  updatedAt: string;
}

export interface WhiteLabelBranding {
  companyName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  /** Esconde "Powered by BookAgent" */
  hidePoweredBy: boolean;
  /** Email de suporte do parceiro */
  supportEmail: string | null;
}

/** Invoice de uso da API (pay-per-use). */
export interface ApiInvoice {
  id: string;
  tenantId: string;
  apiKeyId: string;
  tier: ApiUsageTier;
  /** Período do invoice */
  periodStart: string;
  periodEnd: string;
  /** Contadores de uso */
  usage: ApiUsageBreakdown;
  /** Valor total (centavos BRL) */
  totalBrl: number;
  isPaid: boolean;
  paidAt: string | null;
  createdAt: string;
}

export interface ApiUsageBreakdown {
  totalRequests: number;
  jobsProcessed: number;
  videosRendered: number;
  blogsGenerated: number;
  landingPagesGenerated: number;
  aiTokensUsed: number;
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export interface ApiPricingTier {
  tier: ApiUsageTier;
  label: string;
  monthlyBaseBrl: number;
  includedJobs: number;
  pricePerExtraJobBrl: number;
  includedApiCalls: number;
  pricePerExtraCallBrl: number;
  rateLimit: number;
  features: string[];
}

export const API_PRICING: ApiPricingTier[] = [
  {
    tier: ApiUsageTier.FREE,
    label: 'Free',
    monthlyBaseBrl: 0,
    includedJobs: 5,
    pricePerExtraJobBrl: 0,
    includedApiCalls: 100,
    pricePerExtraCallBrl: 0,
    rateLimit: 10,
    features: ['PDF processing', 'Blog generation', 'Basic artifacts'],
  },
  {
    tier: ApiUsageTier.STARTER,
    label: 'Starter',
    monthlyBaseBrl: 9700,
    includedJobs: 50,
    pricePerExtraJobBrl: 500,
    includedApiCalls: 5000,
    pricePerExtraCallBrl: 5,
    rateLimit: 60,
    features: ['All formats', 'Media plans', 'Landing pages', 'Webhooks'],
  },
  {
    tier: ApiUsageTier.GROWTH,
    label: 'Growth',
    monthlyBaseBrl: 29700,
    includedJobs: 200,
    pricePerExtraJobBrl: 400,
    includedApiCalls: 20000,
    pricePerExtraCallBrl: 3,
    rateLimit: 200,
    features: ['Priority processing', 'Video render', 'Auto-publish', 'SLA 99.9%'],
  },
  {
    tier: ApiUsageTier.ENTERPRISE,
    label: 'Enterprise',
    monthlyBaseBrl: 99700,
    includedJobs: 1000,
    pricePerExtraJobBrl: 300,
    includedApiCalls: 100000,
    pricePerExtraCallBrl: 2,
    rateLimit: 1000,
    features: ['Dedicated infra', 'White-label', 'Custom models', 'SLA 99.99%', 'Priority support'],
  },
];

export const CHANNEL_TYPE_LABELS: Record<DistributionChannelType, string> = {
  [DistributionChannelType.DIRECT_SAAS]:    'SaaS Direto',
  [DistributionChannelType.API_USAGE]:      'API Usage',
  [DistributionChannelType.WHITE_LABEL]:    'White Label',
  [DistributionChannelType.AFFILIATE]:      'Afiliados',
  [DistributionChannelType.PARTNER_RESALE]: 'Revenda Parceiros',
  [DistributionChannelType.MARKETPLACE]:    'Marketplace',
};

export const MONETIZATION_LABELS: Record<MonetizationModel, string> = {
  [MonetizationModel.SUBSCRIPTION]:  'Assinatura Mensal',
  [MonetizationModel.PAY_PER_USE]:   'Pay-per-Use',
  [MonetizationModel.REVENUE_SHARE]: 'Revenue Share',
  [MonetizationModel.LICENSE]:       'Licenciamento',
  [MonetizationModel.FREEMIUM]:      'Freemium',
};
