/**
 * Tenant Service — SaaS Multi-Tenant Management
 *
 * CRUD completo para tenants + onboarding flow.
 * Integra com billing para criar subscription junto com o tenant.
 *
 * Persistência: bookagent_tenants
 *
 * Parte 101: SaaS Multi-Tenant + Billing Real
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type { Tenant, TenantPlan, TenantContext, TenantMember } from '../../domain/entities/tenant.js';
import {
  TenantStatus,
  TenantRole,
  LearningScope,
  PLAN_FEATURES,
  PLAN_TENANT_LIMITS,
} from '../../domain/entities/tenant.js';
import type { PlanTier } from '../../plans/plan-config.js';
import { createSubscription } from '../billing/subscription-manager.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const TABLE = 'bookagent_tenants';

// ---------------------------------------------------------------------------
// Create Tenant + Onboarding
// ---------------------------------------------------------------------------

export interface CreateTenantInput {
  name: string;
  slug?: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  planTier?: PlanTier;
  trial?: boolean;
}

/**
 * Creates a new tenant with subscription and initial setup.
 */
export async function createTenant(
  input: CreateTenantInput,
  supabase: SupabaseClient | null,
): Promise<Tenant> {
  const now = new Date();
  const planTier: PlanTier = input.planTier ?? 'starter';
  const isTrial = input.trial ?? true;
  const slug = input.slug ?? input.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const features = PLAN_FEATURES[planTier];
  const limits = PLAN_TENANT_LIMITS[planTier];

  const plan: TenantPlan = {
    tier: planTier,
    features,
    limits,
    startedAt: now,
    expiresAt: null,
    isTrial,
    trialDaysRemaining: isTrial ? 7 : 0,
  };

  const owner: TenantMember = {
    userId: input.ownerId,
    role: TenantRole.OWNER,
    name: input.ownerName,
    email: input.ownerEmail,
    joinedAt: now,
  };

  const tenant: Tenant = {
    id: uuid(),
    name: input.name,
    slug,
    status: isTrial ? TenantStatus.TRIAL : TenantStatus.ACTIVE,
    plan,
    ownerId: input.ownerId,
    members: [owner],
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };

  // Persist tenant — columns must match actual bookagent_tenants schema
  if (supabase) {
    await supabase.upsert(TABLE, {
      id: tenant.id,
      auth_user_id: input.ownerId,
      name: tenant.name,
      email: input.ownerEmail,
      plan_tier: planTier,
      subscription_status: isTrial ? 'trial' : 'active',
      trial_ends_at: isTrial ? new Date(now.getTime() + 7 * 86400000).toISOString() : null,
      metadata: JSON.stringify(tenant.metadata),
      created_at: tenant.createdAt.toISOString(),
      updated_at: tenant.updatedAt.toISOString(),
    }, 'id');

    // Create subscription
    try {
      await createSubscription(tenant.id, planTier, supabase, {
        trial: isTrial,
        trialDays: isTrial ? 7 : 0,
        customerEmail: input.ownerEmail,
        customerName: input.ownerName,
      });
    } catch (err) {
      logger.warn(`[TenantService] Subscription creation failed for tenant ${tenant.id}: ${err}`);
      // Tenant still created — subscription can be retried
    }
  }

  logger.info(
    `[TenantService] Tenant created: ${tenant.id} name="${tenant.name}" ` +
    `plan=${planTier} trial=${isTrial}`,
  );

  return tenant;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getTenant(
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<Tenant | null> {
  if (!supabase) return null;

  try {
    const rows = await supabase.select<Record<string, unknown>>(TABLE, {
      filters: [{ column: 'id', operator: 'eq', value: tenantId }],
      limit: 1,
    });
    if (rows.length === 0) return null;
    return mapRow(rows[0]);
  } catch {
    return null;
  }
}

export async function getTenantBySlug(
  slug: string,
  supabase: SupabaseClient | null,
): Promise<Tenant | null> {
  if (!supabase) return null;

  try {
    const rows = await supabase.select<Record<string, unknown>>(TABLE, {
      filters: [{ column: 'slug', operator: 'eq', value: slug }],
      limit: 1,
    });
    if (rows.length === 0) return null;
    return mapRow(rows[0]);
  } catch {
    return null;
  }
}

export async function listTenants(
  supabase: SupabaseClient | null,
  limit = 100,
): Promise<Tenant[]> {
  if (!supabase) return [];

  try {
    const rows = await supabase.select<Record<string, unknown>>(TABLE, {
      filters: [],
      orderBy: 'created_at',
      orderDesc: true,
      limit,
    });
    return rows.map(mapRow);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateTenantStatus(
  tenantId: string,
  status: TenantStatus,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  await supabase.upsert(TABLE, {
    id: tenantId,
    status,
    updated_at: new Date().toISOString(),
  }, 'id');

  logger.info(`[TenantService] Tenant ${tenantId} status → ${status}`);
}

export async function updateTenantPlan(
  tenantId: string,
  planTier: PlanTier,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  const features = PLAN_FEATURES[planTier];
  const limits = PLAN_TENANT_LIMITS[planTier];

  const plan: TenantPlan = {
    tier: planTier,
    features,
    limits,
    startedAt: new Date(),
    expiresAt: null,
    isTrial: false,
    trialDaysRemaining: 0,
  };

  await supabase.upsert(TABLE, {
    id: tenantId,
    plan: JSON.stringify(plan),
    status: TenantStatus.ACTIVE,
    updated_at: new Date().toISOString(),
  }, 'id');

  logger.info(`[TenantService] Tenant ${tenantId} plan → ${planTier}`);
}

export async function addTenantMember(
  tenantId: string,
  member: TenantMember,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  const tenant = await getTenant(tenantId, supabase);
  if (!tenant) return;

  tenant.members.push(member);

  await supabase.upsert(TABLE, {
    id: tenantId,
    members: JSON.stringify(tenant.members),
    updated_at: new Date().toISOString(),
  }, 'id');
}

// ---------------------------------------------------------------------------
// Build TenantContext
// ---------------------------------------------------------------------------

/**
 * Builds a TenantContext snapshot from a persisted tenant.
 */
export async function buildTenantContext(
  tenantId: string,
  userId: string,
  supabase: SupabaseClient | null,
): Promise<TenantContext> {
  const tenant = await getTenant(tenantId, supabase);

  if (!tenant) {
    // Fallback: default context
    return {
      tenantId,
      userId,
      userRole: TenantRole.MEMBER,
      planTier: 'starter',
      features: PLAN_FEATURES['starter'],
      limits: PLAN_TENANT_LIMITS['starter'],
      learningScope: LearningScope.TENANT,
    };
  }

  const member = tenant.members.find((m) => m.userId === userId);

  return {
    tenantId: tenant.id,
    userId,
    userRole: member?.role ?? TenantRole.MEMBER,
    planTier: tenant.plan.tier,
    features: tenant.plan.features,
    limits: tenant.plan.limits,
    learningScope: tenant.plan.limits.learningScope,
  };
}

// ---------------------------------------------------------------------------
// Row Mapper
// ---------------------------------------------------------------------------

function mapRow(r: Record<string, unknown>): Tenant {
  function pj<T>(v: unknown, fb: T): T {
    if (!v) return fb;
    try { return typeof v === 'string' ? JSON.parse(v) : v as T; }
    catch { return fb; }
  }

  const rawPlan = pj<Record<string, unknown>>(r['plan'], {});
  const plan: TenantPlan = {
    tier: (rawPlan['tier'] as PlanTier) ?? 'starter',
    features: (rawPlan['features'] as TenantPlan['features']) ?? PLAN_FEATURES['starter'],
    limits: (rawPlan['limits'] as TenantPlan['limits']) ?? PLAN_TENANT_LIMITS['starter'],
    startedAt: rawPlan['startedAt'] ? new Date(rawPlan['startedAt'] as string) : new Date(r['created_at'] as string),
    expiresAt: rawPlan['expiresAt'] ? new Date(rawPlan['expiresAt'] as string) : null,
    isTrial: (rawPlan['isTrial'] as boolean) ?? false,
    trialDaysRemaining: (rawPlan['trialDaysRemaining'] as number) ?? 0,
  };

  return {
    id: r['id'] as string,
    name: (r['name'] as string) ?? '',
    slug: (r['slug'] as string) ?? '',
    status: (r['status'] as TenantStatus) ?? TenantStatus.ACTIVE,
    plan,
    ownerId: (r['owner_id'] as string) ?? '',
    members: pj(r['members'], []),
    metadata: pj(r['metadata'], {}),
    createdAt: new Date(r['created_at'] as string),
    updatedAt: new Date(r['updated_at'] as string),
  };
}
