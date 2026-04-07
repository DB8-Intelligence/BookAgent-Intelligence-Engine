/**
 * Distribution Engine — Distribuição & Monetização
 *
 * Gerencia canais de distribuição, white-label, payouts
 * de afiliados e invoicing de API.
 *
 * Parte 103: Escala — Distribuição
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  DistributionChannel,
  AffiliatePayout,
  WhiteLabelConfig,
  WhiteLabelBranding,
  ApiInvoice,
  ApiUsageBreakdown,
} from '../../domain/entities/distribution.js';
import {
  DistributionChannelType,
  MonetizationModel,
  PayoutStatus,
  WhiteLabelStatus,
  ApiUsageTier,
  API_PRICING,
} from '../../domain/entities/distribution.js';
import { logger } from '../../utils/logger.js';

const CHANNELS_TABLE     = 'bookagent_distribution_channels';
const PAYOUTS_TABLE      = 'bookagent_affiliate_payouts';
const WHITE_LABEL_TABLE  = 'bookagent_white_label_configs';
const API_INVOICES_TABLE = 'bookagent_api_invoices';

// ---------------------------------------------------------------------------
// Distribution Channels
// ---------------------------------------------------------------------------

export async function createDistributionChannel(
  type: DistributionChannelType,
  name: string,
  model: MonetizationModel,
  config: Record<string, unknown>,
  supabase: SupabaseClient | null,
): Promise<DistributionChannel> {
  const now = new Date().toISOString();

  const channel: DistributionChannel = {
    id: uuid(),
    type,
    name,
    model,
    isActive: true,
    totalRevenueBrl: 0,
    activeCustomers: 0,
    config,
    createdAt: now,
    updatedAt: now,
  };

  if (supabase) {
    await supabase.upsert(CHANNELS_TABLE, {
      id: channel.id,
      type,
      name,
      model,
      is_active: true,
      total_revenue_brl: 0,
      active_customers: 0,
      config: JSON.stringify(config),
      created_at: now,
      updated_at: now,
    }, 'id');
  }

  logger.info(`[Distribution] Channel created: ${channel.id} type=${type} model=${model}`);
  return channel;
}

export async function listDistributionChannels(
  supabase: SupabaseClient | null,
): Promise<DistributionChannel[]> {
  if (!supabase) return [];
  try {
    const rows = await supabase.select<Record<string, unknown>>(CHANNELS_TABLE, {
      orderBy: 'created_at', orderDesc: true, limit: 50,
    });
    return rows.map(mapChannel);
  } catch { return []; }
}

export async function getDistributionOverview(
  supabase: SupabaseClient | null,
): Promise<DistributionOverview> {
  const overview: DistributionOverview = {
    totalChannels: 0,
    totalRevenueBrl: 0,
    totalCustomers: 0,
    channelBreakdown: [],
    topChannel: null,
  };

  if (!supabase) return overview;

  try {
    const channels = await listDistributionChannels(supabase);
    overview.totalChannels = channels.length;
    overview.totalRevenueBrl = channels.reduce((s, c) => s + c.totalRevenueBrl, 0);
    overview.totalCustomers = channels.reduce((s, c) => s + c.activeCustomers, 0);

    overview.channelBreakdown = channels.map((c) => ({
      type: c.type,
      name: c.name,
      revenue: c.totalRevenueBrl,
      customers: c.activeCustomers,
    }));

    if (channels.length > 0) {
      const top = channels.reduce((a, b) => a.totalRevenueBrl > b.totalRevenueBrl ? a : b);
      overview.topChannel = top.name;
    }
  } catch { /* graceful */ }

  return overview;
}

export interface DistributionOverview {
  totalChannels: number;
  totalRevenueBrl: number;
  totalCustomers: number;
  channelBreakdown: { type: DistributionChannelType; name: string; revenue: number; customers: number }[];
  topChannel: string | null;
}

// ---------------------------------------------------------------------------
// White-Label
// ---------------------------------------------------------------------------

export async function createWhiteLabelConfig(
  partnerId: string,
  tenantId: string,
  branding: WhiteLabelBranding,
  customDomain: string | null,
  allowedPlans: string[],
  maxEndCustomers: number,
  supabase: SupabaseClient | null,
): Promise<WhiteLabelConfig> {
  const now = new Date().toISOString();

  const config: WhiteLabelConfig = {
    id: uuid(),
    partnerId,
    tenantId,
    status: WhiteLabelStatus.TRIAL,
    branding,
    customDomain,
    allowedPlans,
    maxEndCustomers,
    currentEndCustomers: 0,
    createdAt: now,
    updatedAt: now,
  };

  if (supabase) {
    await supabase.upsert(WHITE_LABEL_TABLE, {
      id: config.id,
      partner_id: partnerId,
      tenant_id: tenantId,
      status: config.status,
      branding: JSON.stringify(branding),
      custom_domain: customDomain,
      allowed_plans: JSON.stringify(allowedPlans),
      max_end_customers: maxEndCustomers,
      current_end_customers: 0,
      created_at: now,
      updated_at: now,
    }, 'id');
  }

  logger.info(`[Distribution] White-label config created: ${config.id} partner=${partnerId}`);
  return config;
}

export async function getWhiteLabelConfig(
  partnerId: string,
  supabase: SupabaseClient | null,
): Promise<WhiteLabelConfig | null> {
  if (!supabase) return null;
  try {
    const rows = await supabase.select<Record<string, unknown>>(WHITE_LABEL_TABLE, {
      filters: [{ column: 'partner_id', operator: 'eq', value: partnerId }],
      limit: 1,
    });
    return rows.length > 0 ? mapWhiteLabel(rows[0]) : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Affiliate Payouts
// ---------------------------------------------------------------------------

export async function createPayout(
  partnerId: string,
  tenantId: string,
  amountBrl: number,
  periodStart: string,
  periodEnd: string,
  referralId: string | null,
  supabase: SupabaseClient | null,
): Promise<AffiliatePayout> {
  const now = new Date().toISOString();

  const payout: AffiliatePayout = {
    id: uuid(),
    partnerId,
    tenantId,
    referralId,
    amountBrl,
    status: PayoutStatus.PENDING,
    periodStart,
    periodEnd,
    paidAt: null,
    metadata: {},
    createdAt: now,
  };

  if (supabase) {
    await supabase.upsert(PAYOUTS_TABLE, {
      id: payout.id,
      partner_id: partnerId,
      tenant_id: tenantId,
      referral_id: referralId,
      amount_brl: amountBrl,
      status: payout.status,
      period_start: periodStart,
      period_end: periodEnd,
      created_at: now,
    }, 'id');
  }

  logger.info(`[Distribution] Payout created: ${payout.id} partner=${partnerId} amount=${amountBrl}`);
  return payout;
}

export async function listPayouts(
  partnerId: string,
  supabase: SupabaseClient | null,
  limit = 50,
): Promise<AffiliatePayout[]> {
  if (!supabase) return [];
  try {
    const rows = await supabase.select<Record<string, unknown>>(PAYOUTS_TABLE, {
      filters: [{ column: 'partner_id', operator: 'eq', value: partnerId }],
      orderBy: 'created_at', orderDesc: true, limit,
    });
    return rows.map(mapPayout);
  } catch { return []; }
}

export async function approvePayout(
  payoutId: string,
  supabase: SupabaseClient | null,
): Promise<boolean> {
  if (!supabase) return false;
  try {
    await supabase.upsert(PAYOUTS_TABLE, {
      id: payoutId,
      status: PayoutStatus.APPROVED,
    }, 'id');
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// API Invoicing
// ---------------------------------------------------------------------------

export async function generateApiInvoice(
  tenantId: string,
  apiKeyId: string,
  tier: ApiUsageTier,
  usage: ApiUsageBreakdown,
  periodStart: string,
  periodEnd: string,
  supabase: SupabaseClient | null,
): Promise<ApiInvoice> {
  // Calculate total based on tier pricing
  const pricing = API_PRICING.find((p) => p.tier === tier);
  let totalBrl = pricing?.monthlyBaseBrl ?? 0;

  if (pricing) {
    const extraJobs = Math.max(0, usage.jobsProcessed - pricing.includedJobs);
    totalBrl += extraJobs * pricing.pricePerExtraJobBrl;

    const extraCalls = Math.max(0, usage.totalRequests - pricing.includedApiCalls);
    totalBrl += extraCalls * pricing.pricePerExtraCallBrl;
  }

  const now = new Date().toISOString();
  const invoice: ApiInvoice = {
    id: uuid(),
    tenantId,
    apiKeyId,
    tier,
    periodStart,
    periodEnd,
    usage,
    totalBrl,
    isPaid: false,
    paidAt: null,
    createdAt: now,
  };

  if (supabase) {
    await supabase.upsert(API_INVOICES_TABLE, {
      id: invoice.id,
      tenant_id: tenantId,
      api_key_id: apiKeyId,
      tier,
      period_start: periodStart,
      period_end: periodEnd,
      usage: JSON.stringify(usage),
      total_brl: totalBrl,
      is_paid: false,
      created_at: now,
    }, 'id');
  }

  logger.info(`[Distribution] API invoice: ${invoice.id} tenant=${tenantId} total=${totalBrl}`);
  return invoice;
}

export async function listApiInvoices(
  tenantId: string,
  supabase: SupabaseClient | null,
  limit = 20,
): Promise<ApiInvoice[]> {
  if (!supabase) return [];
  try {
    const rows = await supabase.select<Record<string, unknown>>(API_INVOICES_TABLE, {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      orderBy: 'created_at', orderDesc: true, limit,
    });
    return rows.map(mapInvoice);
  } catch { return []; }
}

export function getApiPricing() {
  return API_PRICING;
}

// ---------------------------------------------------------------------------
// Row Mappers
// ---------------------------------------------------------------------------

function pj<T>(v: unknown, fb: T): T {
  if (!v) return fb;
  try { return typeof v === 'string' ? JSON.parse(v) : v as T; } catch { return fb; }
}

function mapChannel(r: Record<string, unknown>): DistributionChannel {
  return {
    id: r['id'] as string,
    type: (r['type'] as DistributionChannelType) ?? DistributionChannelType.DIRECT_SAAS,
    name: (r['name'] as string) ?? '',
    model: (r['model'] as MonetizationModel) ?? MonetizationModel.SUBSCRIPTION,
    isActive: (r['is_active'] as boolean) ?? false,
    totalRevenueBrl: (r['total_revenue_brl'] as number) ?? 0,
    activeCustomers: (r['active_customers'] as number) ?? 0,
    config: pj(r['config'], {}),
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string,
  };
}

function mapWhiteLabel(r: Record<string, unknown>): WhiteLabelConfig {
  return {
    id: r['id'] as string,
    partnerId: (r['partner_id'] as string) ?? '',
    tenantId: (r['tenant_id'] as string) ?? '',
    status: (r['status'] as WhiteLabelStatus) ?? WhiteLabelStatus.INACTIVE,
    branding: pj(r['branding'], { companyName: '', logoUrl: null, primaryColor: '#000', accentColor: '#fff', hidePoweredBy: false, supportEmail: null }),
    customDomain: (r['custom_domain'] as string) ?? null,
    allowedPlans: pj(r['allowed_plans'], ['basic']),
    maxEndCustomers: (r['max_end_customers'] as number) ?? 10,
    currentEndCustomers: (r['current_end_customers'] as number) ?? 0,
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string,
  };
}

function mapPayout(r: Record<string, unknown>): AffiliatePayout {
  return {
    id: r['id'] as string,
    partnerId: (r['partner_id'] as string) ?? '',
    tenantId: (r['tenant_id'] as string) ?? '',
    referralId: (r['referral_id'] as string) ?? null,
    amountBrl: (r['amount_brl'] as number) ?? 0,
    status: (r['status'] as PayoutStatus) ?? PayoutStatus.PENDING,
    periodStart: r['period_start'] as string,
    periodEnd: r['period_end'] as string,
    paidAt: (r['paid_at'] as string) ?? null,
    metadata: pj(r['metadata'], {}),
    createdAt: r['created_at'] as string,
  };
}

function mapInvoice(r: Record<string, unknown>): ApiInvoice {
  return {
    id: r['id'] as string,
    tenantId: (r['tenant_id'] as string) ?? '',
    apiKeyId: (r['api_key_id'] as string) ?? '',
    tier: (r['tier'] as ApiUsageTier) ?? ApiUsageTier.FREE,
    periodStart: r['period_start'] as string,
    periodEnd: r['period_end'] as string,
    usage: pj(r['usage'], { totalRequests: 0, jobsProcessed: 0, videosRendered: 0, blogsGenerated: 0, landingPagesGenerated: 0, aiTokensUsed: 0 }),
    totalBrl: (r['total_brl'] as number) ?? 0,
    isPaid: (r['is_paid'] as boolean) ?? false,
    paidAt: (r['paid_at'] as string) ?? null,
    createdAt: r['created_at'] as string,
  };
}
