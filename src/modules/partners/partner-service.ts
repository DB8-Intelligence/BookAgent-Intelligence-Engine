/**
 * Partner & Affiliate Service — Scale & Distribution
 *
 * Gerencia parceiros, afiliados, API keys, referrals e
 * webhooks de integração.
 *
 * Parte 103: Escala + API + Parcerias
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  Partner,
  ApiKeyRecord,
  Referral,
  IntegrationWebhook,
  CommissionConfig,
} from '../../domain/entities/partner.js';
import {
  PartnerType,
  PartnerStatus,
  ReferralStatus,
  DEFAULT_COMMISSIONS,
} from '../../domain/entities/partner.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const PARTNERS_TABLE = 'bookagent_partners';
const API_KEYS_TABLE = 'bookagent_api_keys';
const REFERRALS_TABLE = 'bookagent_referrals';
const WEBHOOKS_TABLE = 'bookagent_integration_webhooks';

// ---------------------------------------------------------------------------
// Partner CRUD
// ---------------------------------------------------------------------------

export interface CreatePartnerInput {
  tenantId: string;
  type: PartnerType;
  name: string;
  contactEmail: string;
  contactPhone?: string;
  commission?: CommissionConfig;
}

export async function createPartner(
  input: CreatePartnerInput,
  supabase: SupabaseClient | null,
): Promise<Partner> {
  const now = new Date().toISOString();
  const referralCode = `ref-${input.name.toLowerCase().replace(/\s+/g, '-').slice(0, 20)}-${uuid().slice(0, 6)}`;
  const commission = input.commission ?? DEFAULT_COMMISSIONS[input.type];

  const partner: Partner = {
    id: uuid(),
    tenantId: input.tenantId,
    type: input.type,
    status: PartnerStatus.ACTIVE,
    name: input.name,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone ?? null,
    referralCode,
    commission,
    totalReferrals: 0,
    totalRevenueBrl: 0,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };

  if (supabase) {
    await supabase.upsert(PARTNERS_TABLE, {
      id: partner.id,
      tenant_id: partner.tenantId,
      type: partner.type,
      status: partner.status,
      name: partner.name,
      contact_email: partner.contactEmail,
      contact_phone: partner.contactPhone,
      referral_code: partner.referralCode,
      commission: JSON.stringify(partner.commission),
      total_referrals: 0,
      total_revenue_brl: 0,
      metadata: JSON.stringify({}),
      created_at: now,
      updated_at: now,
    }, 'id');
  }

  logger.info(`[Partners] Created partner: ${partner.id} code=${referralCode} type=${input.type}`);
  return partner;
}

export async function listPartners(
  tenantId: string | null,
  supabase: SupabaseClient | null,
  limit = 50,
): Promise<Partner[]> {
  if (!supabase) return [];
  type F = { column: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'in'; value: string | number | boolean | null };
  const filters: F[] = [];
  if (tenantId) filters.push({ column: 'tenant_id', operator: 'eq', value: tenantId });

  try {
    const rows = await supabase.select<Record<string, unknown>>(PARTNERS_TABLE, {
      filters, orderBy: 'created_at', orderDesc: true, limit,
    });
    return rows.map(mapPartner);
  } catch { return []; }
}

export async function getPartnerByReferralCode(
  code: string,
  supabase: SupabaseClient | null,
): Promise<Partner | null> {
  if (!supabase) return null;
  try {
    const rows = await supabase.select<Record<string, unknown>>(PARTNERS_TABLE, {
      filters: [{ column: 'referral_code', operator: 'eq', value: code }],
      limit: 1,
    });
    return rows.length > 0 ? mapPartner(rows[0]) : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// API Key Management
// ---------------------------------------------------------------------------

export async function createApiKey(
  tenantId: string,
  name: string,
  planTier: string,
  supabase: SupabaseClient | null,
): Promise<{ key: string; record: ApiKeyRecord }> {
  const crypto = require('crypto') as typeof import('crypto');
  const rawKey = `ba_live_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 12) + '...';
  const now = new Date().toISOString();

  const record: ApiKeyRecord = {
    id: uuid(),
    tenantId,
    keyHash,
    keyPrefix,
    name,
    isActive: true,
    planTier,
    rateLimitPerMinute: planTier === 'business' ? 200 : 60,
    totalRequests: 0,
    lastUsedAt: null,
    createdAt: now,
    expiresAt: null,
  };

  if (supabase) {
    await supabase.upsert(API_KEYS_TABLE, {
      id: record.id,
      tenant_id: record.tenantId,
      key_hash: record.keyHash,
      key_prefix: record.keyPrefix,
      name: record.name,
      is_active: record.isActive,
      plan_tier: record.planTier,
      rate_limit_per_minute: record.rateLimitPerMinute,
      total_requests: 0,
      last_used_at: null,
      created_at: now,
      expires_at: null,
    }, 'id');
  }

  logger.info(`[Partners] API key created: ${record.keyPrefix} for tenant=${tenantId}`);

  // Return raw key only once — never stored
  return { key: rawKey, record };
}

export async function listApiKeys(
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<ApiKeyRecord[]> {
  if (!supabase) return [];
  try {
    const rows = await supabase.select<Record<string, unknown>>(API_KEYS_TABLE, {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      orderBy: 'created_at', orderDesc: true, limit: 20,
    });
    return rows.map(mapApiKey);
  } catch { return []; }
}

export async function revokeApiKey(
  keyId: string,
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<boolean> {
  if (!supabase) return false;
  try {
    await supabase.upsert(API_KEYS_TABLE, {
      id: keyId,
      tenant_id: tenantId,
      is_active: false,
    }, 'id');
    logger.info(`[Partners] API key revoked: ${keyId}`);
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Referral Tracking
// ---------------------------------------------------------------------------

export async function trackReferralClick(
  referralCode: string,
  sourceIp: string | null,
  supabase: SupabaseClient | null,
): Promise<Referral | null> {
  const partner = await getPartnerByReferralCode(referralCode, supabase);
  if (!partner) return null;

  const referral: Referral = {
    id: uuid(),
    partnerId: partner.id,
    referralCode,
    referredTenantId: null,
    status: ReferralStatus.CLICKED,
    sourceIp,
    convertedPlan: null,
    firstPaymentBrl: null,
    clickedAt: new Date().toISOString(),
    signedUpAt: null,
    convertedAt: null,
  };

  if (supabase) {
    await supabase.upsert(REFERRALS_TABLE, {
      id: referral.id,
      partner_id: referral.partnerId,
      referral_code: referral.referralCode,
      status: referral.status,
      source_ip: referral.sourceIp,
      clicked_at: referral.clickedAt,
    }, 'id');
  }

  return referral;
}

export async function convertReferral(
  referralCode: string,
  tenantId: string,
  planTier: string,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  try {
    // Find the most recent click for this code
    const rows = await supabase.select<Record<string, unknown>>(REFERRALS_TABLE, {
      filters: [
        { column: 'referral_code', operator: 'eq', value: referralCode },
        { column: 'status', operator: 'eq', value: 'clicked' },
      ],
      orderBy: 'clicked_at', orderDesc: true, limit: 1,
    });

    if (rows.length > 0) {
      const now = new Date().toISOString();
      await supabase.upsert(REFERRALS_TABLE, {
        id: rows[0]['id'] as string,
        referred_tenant_id: tenantId,
        status: ReferralStatus.CONVERTED,
        converted_plan: planTier,
        signed_up_at: now,
        converted_at: now,
      }, 'id');

      // Increment partner's referral count
      const partner = await getPartnerByReferralCode(referralCode, supabase);
      if (partner) {
        await supabase.upsert(PARTNERS_TABLE, {
          id: partner.id,
          total_referrals: partner.totalReferrals + 1,
          updated_at: now,
        }, 'id');
      }

      logger.info(`[Partners] Referral converted: code=${referralCode} tenant=${tenantId} plan=${planTier}`);
    }
  } catch { /* graceful */ }
}

// ---------------------------------------------------------------------------
// Integration Webhooks
// ---------------------------------------------------------------------------

export async function registerWebhook(
  tenantId: string,
  url: string,
  events: string[],
  supabase: SupabaseClient | null,
): Promise<IntegrationWebhook> {
  const crypto = require('crypto') as typeof import('crypto');
  const secret = `whsec_${crypto.randomBytes(16).toString('hex')}`;
  const now = new Date().toISOString();

  const webhook: IntegrationWebhook = {
    id: uuid(),
    tenantId,
    url,
    events,
    secret,
    isActive: true,
    lastStatusCode: null,
    lastTriggeredAt: null,
    failureCount: 0,
    createdAt: now,
  };

  if (supabase) {
    await supabase.upsert(WEBHOOKS_TABLE, {
      id: webhook.id,
      tenant_id: webhook.tenantId,
      url: webhook.url,
      events: JSON.stringify(webhook.events),
      secret: webhook.secret,
      is_active: true,
      failure_count: 0,
      created_at: now,
    }, 'id');
  }

  logger.info(`[Partners] Webhook registered: ${webhook.id} url=${url} events=${events.join(',')}`);
  return webhook;
}

export async function dispatchWebhook(
  tenantId: string,
  event: string,
  payload: Record<string, unknown>,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  try {
    const rows = await supabase.select<Record<string, unknown>>(WEBHOOKS_TABLE, {
      filters: [
        { column: 'tenant_id', operator: 'eq', value: tenantId },
        { column: 'is_active', operator: 'eq', value: true },
      ],
      limit: 20,
    });

    for (const row of rows) {
      let events: string[] = [];
      try {
        const raw = row['events'];
        events = typeof raw === 'string' ? JSON.parse(raw) : (raw as string[]) ?? [];
      } catch { events = []; }

      if (!events.includes(event)) continue;

      const url = row['url'] as string;
      const secret = row['secret'] as string;
      const webhookId = row['id'] as string;

      // Build signed payload
      const crypto = require('crypto') as typeof import('crypto');
      const timestamp = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({ event, timestamp, data: payload });
      const signature = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${body}`)
        .digest('hex');

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-BookAgent-Signature': `t=${timestamp},v1=${signature}`,
            'X-BookAgent-Event': event,
          },
          body,
          signal: AbortSignal.timeout(10000),
        });

        await supabase.upsert(WEBHOOKS_TABLE, {
          id: webhookId,
          last_status_code: res.status,
          last_triggered_at: new Date().toISOString(),
          failure_count: res.ok ? 0 : ((row['failure_count'] as number) ?? 0) + 1,
        }, 'id');
      } catch (err) {
        await supabase.upsert(WEBHOOKS_TABLE, {
          id: webhookId,
          failure_count: ((row['failure_count'] as number) ?? 0) + 1,
          last_triggered_at: new Date().toISOString(),
        }, 'id');
        logger.warn(`[Partners] Webhook dispatch failed: ${url} — ${err}`);
      }
    }
  } catch { /* graceful */ }
}

export async function listWebhooks(
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<IntegrationWebhook[]> {
  if (!supabase) return [];
  try {
    const rows = await supabase.select<Record<string, unknown>>(WEBHOOKS_TABLE, {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      orderBy: 'created_at', orderDesc: true, limit: 20,
    });
    return rows.map(mapWebhook);
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Row Mappers
// ---------------------------------------------------------------------------

function pj<T>(v: unknown, fb: T): T {
  if (!v) return fb;
  try { return typeof v === 'string' ? JSON.parse(v) : v as T; } catch { return fb; }
}

function mapPartner(r: Record<string, unknown>): Partner {
  return {
    id: r['id'] as string,
    tenantId: (r['tenant_id'] as string) ?? '',
    type: (r['type'] as PartnerType) ?? PartnerType.AFFILIATE,
    status: (r['status'] as PartnerStatus) ?? PartnerStatus.ACTIVE,
    name: (r['name'] as string) ?? '',
    contactEmail: (r['contact_email'] as string) ?? '',
    contactPhone: (r['contact_phone'] as string) ?? null,
    referralCode: (r['referral_code'] as string) ?? '',
    commission: pj(r['commission'], DEFAULT_COMMISSIONS[PartnerType.AFFILIATE]),
    totalReferrals: (r['total_referrals'] as number) ?? 0,
    totalRevenueBrl: (r['total_revenue_brl'] as number) ?? 0,
    metadata: pj(r['metadata'], {}),
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string,
  };
}

function mapApiKey(r: Record<string, unknown>): ApiKeyRecord {
  return {
    id: r['id'] as string,
    tenantId: (r['tenant_id'] as string) ?? '',
    keyHash: (r['key_hash'] as string) ?? '',
    keyPrefix: (r['key_prefix'] as string) ?? '',
    name: (r['name'] as string) ?? '',
    isActive: (r['is_active'] as boolean) ?? false,
    planTier: (r['plan_tier'] as string) ?? 'basic',
    rateLimitPerMinute: (r['rate_limit_per_minute'] as number) ?? 60,
    totalRequests: (r['total_requests'] as number) ?? 0,
    lastUsedAt: (r['last_used_at'] as string) ?? null,
    createdAt: r['created_at'] as string,
    expiresAt: (r['expires_at'] as string) ?? null,
  };
}

function mapWebhook(r: Record<string, unknown>): IntegrationWebhook {
  return {
    id: r['id'] as string,
    tenantId: (r['tenant_id'] as string) ?? '',
    url: (r['url'] as string) ?? '',
    events: pj(r['events'], []),
    secret: (r['secret'] as string) ?? '',
    isActive: (r['is_active'] as boolean) ?? false,
    lastStatusCode: (r['last_status_code'] as number) ?? null,
    lastTriggeredAt: (r['last_triggered_at'] as string) ?? null,
    failureCount: (r['failure_count'] as number) ?? 0,
    createdAt: r['created_at'] as string,
  };
}
