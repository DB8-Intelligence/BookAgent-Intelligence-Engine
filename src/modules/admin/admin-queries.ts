/**
 * Admin Queries — Admin / Ops Console
 *
 * Serviços de consulta para o painel administrativo.
 * Agrega dados de múltiplos subsistemas via Supabase.
 *
 * Parte 77: Admin / Ops Console Backend
 */

import type {
  AdminTenantView,
  AdminJobView,
  AdminBillingView,
  AdminPublicationView,
  AdminSystemHealthSnapshot,
  AdminListParams,
} from '../../domain/entities/admin.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { checkProviderStatus } from '../../adapters/provider-factory.js';
import { getQueueHealth } from '../../observability/queue-health.js';
import { getProviderStatus } from '../billing/provider-factory.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

/**
 * Lista tenants com dados consolidados.
 */
export async function listTenants(
  supabase: SupabaseClient | null,
  params?: AdminListParams,
): Promise<AdminTenantView[]> {
  if (!supabase) return [];

  try {
    // Get unique tenants from job_meta
    const rows = await supabase.select<{
      tenant_id: string;
      user_id: string;
      plan_type: string;
      created_at: string;
    }>('bookagent_job_meta', {
      select: 'tenant_id,user_id,plan_type,created_at',
      orderBy: 'created_at',
      orderDesc: true,
      limit: params?.limit ?? 100,
    });

    // Aggregate by tenant
    const tenantMap = new Map<string, AdminTenantView>();
    for (const row of rows) {
      const tid = row.tenant_id ?? row.user_id ?? 'unknown';
      if (!tenantMap.has(tid)) {
        tenantMap.set(tid, {
          tenantId: tid,
          name: tid,
          status: 'active',
          planTier: (row.plan_type as AdminTenantView['planTier']) ?? 'starter',
          subscriptionStatus: 'active',
          ownerId: row.user_id ?? '',
          memberCount: 1,
          jobsThisMonth: 0,
          jobsTotal: 0,
          failedJobsThisMonth: 0,
          estimatedCostUsd: 0,
          lastActivityAt: row.created_at,
          createdAt: row.created_at,
        });
      }
      const view = tenantMap.get(tid)!;
      view.jobsTotal++;
    }

    let results = [...tenantMap.values()];

    // Filter by plan
    if (params?.planTier) {
      results = results.filter((t) => t.planTier === params.planTier);
    }
    if (params?.status) {
      results = results.filter((t) => t.status === params.status);
    }

    return results;
  } catch (err) {
    logger.warn(`[AdminQueries] Failed to list tenants: ${err}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

/**
 * Lista jobs com filtros administrativos.
 */
export async function listJobs(
  supabase: SupabaseClient | null,
  params?: AdminListParams,
): Promise<AdminJobView[]> {
  if (!supabase) return [];

  try {
    const filters: Array<{ column: string; operator: 'eq' | 'gte'; value: string }> = [];

    if (params?.status) {
      filters.push({ column: 'approval_status', operator: 'eq', value: params.status });
    }
    if (params?.tenantId) {
      filters.push({ column: 'tenant_id', operator: 'eq', value: params.tenantId });
    }
    if (params?.since) {
      filters.push({ column: 'created_at', operator: 'gte', value: params.since });
    }

    const rows = await supabase.select<{
      job_id: string;
      tenant_id: string | null;
      user_id: string | null;
      approval_status: string | null;
      plan_type: string | null;
      created_at: string;
    }>('bookagent_job_meta', {
      filters: filters.length > 0 ? filters : undefined,
      orderBy: params?.sortBy ?? 'created_at',
      orderDesc: (params?.sortDir ?? 'desc') === 'desc',
      limit: params?.limit ?? 50,
    });

    return rows.map((row) => ({
      jobId: row.job_id,
      tenantId: row.tenant_id ?? row.user_id ?? 'unknown',
      userId: row.user_id ?? '',
      status: row.approval_status ?? 'unknown',
      approvalStatus: row.approval_status,
      inputType: '',
      artifactsCount: 0,
      durationMs: null,
      error: null,
      createdAt: row.created_at,
      completedAt: null,
    }));
  } catch (err) {
    logger.warn(`[AdminQueries] Failed to list jobs: ${err}`);
    return [];
  }
}

/**
 * Lista jobs com falha.
 */
export async function listFailedJobs(
  supabase: SupabaseClient | null,
  limit: number = 20,
): Promise<AdminJobView[]> {
  return listJobs(supabase, { status: 'failed', limit });
}

// ---------------------------------------------------------------------------
// Publications
// ---------------------------------------------------------------------------

/**
 * Lista publicações com filtros.
 */
export async function listPublications(
  supabase: SupabaseClient | null,
  params?: AdminListParams,
): Promise<AdminPublicationView[]> {
  if (!supabase) return [];

  try {
    const filters: Array<{ column: string; operator: 'eq'; value: string }> = [];

    if (params?.status) {
      filters.push({ column: 'status', operator: 'eq', value: params.status });
    }
    if (params?.tenantId) {
      filters.push({ column: 'user_id', operator: 'eq', value: params.tenantId });
    }

    const rows = await supabase.select<{
      id: string;
      job_id: string;
      user_id: string;
      platform: string;
      status: string;
      platform_url: string | null;
      error: string | null;
      attempt_count: number | null;
      created_at: string;
      published_at: string | null;
    }>('bookagent_publications', {
      filters: filters.length > 0 ? filters : undefined,
      orderBy: 'created_at',
      orderDesc: true,
      limit: params?.limit ?? 50,
    });

    return rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      tenantId: row.user_id,
      platform: row.platform,
      status: row.status,
      postUrl: row.platform_url,
      error: row.error,
      attempts: row.attempt_count ?? 1,
      createdAt: row.created_at,
      publishedAt: row.published_at,
    }));
  } catch (err) {
    logger.warn(`[AdminQueries] Failed to list publications: ${err}`);
    return [];
  }
}

/**
 * Lista publicações falhas.
 */
export async function listFailedPublications(
  supabase: SupabaseClient | null,
  limit: number = 20,
): Promise<AdminPublicationView[]> {
  return listPublications(supabase, { status: 'failed', limit });
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

/**
 * Lista tenants com visão de billing.
 */
export async function listBillingOverview(
  supabase: SupabaseClient | null,
  params?: AdminListParams,
): Promise<AdminBillingView[]> {
  if (!supabase) return [];

  try {
    const filters: Array<{ column: string; operator: 'eq'; value: string }> = [];

    if (params?.status) {
      filters.push({ column: 'status', operator: 'eq', value: params.status });
    }

    const rows = await supabase.select<{
      id: string;
      tenant_id: string;
      plan_tier: string;
      status: string;
      provider: string;
      price_monthly_brl: number;
      last_payment_at: string | null;
      next_billing_at: string | null;
    }>('bookagent_subscriptions', {
      filters: filters.length > 0 ? filters : undefined,
      orderBy: 'created_at',
      orderDesc: true,
      limit: params?.limit ?? 50,
    });

    return rows.map((row) => ({
      tenantId: row.tenant_id,
      tenantName: row.tenant_id,
      planTier: row.plan_tier as AdminBillingView['planTier'],
      subscriptionStatus: row.status,
      provider: row.provider,
      priceMonthlyBRL: row.price_monthly_brl,
      lastPaymentAt: row.last_payment_at,
      nextBillingAt: row.next_billing_at,
      usagePercent: 0,
      alerts: row.status === 'past_due' ? ['Pagamento pendente'] : [],
    }));
  } catch (err) {
    logger.warn(`[AdminQueries] Failed to list billing: ${err}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// System Health
// ---------------------------------------------------------------------------

/**
 * Gera snapshot de saúde do sistema.
 */
export async function getSystemHealth(
  supabase: SupabaseClient | null,
): Promise<AdminSystemHealthSnapshot> {
  const providerStatus = checkProviderStatus();
  const queueHealth = await getQueueHealth();
  const billingProviders = getProviderStatus();
  const billingProvider = billingProviders.find((p) => p.configured) ?? billingProviders[0];

  // Job stats (last 24h)
  let jobs24h = { total: 0, completed: 0, failed: 0, failureRate: 0 };
  if (supabase) {
    const since = new Date(Date.now() - 86400000).toISOString();
    try {
      const rows = await supabase.select<{ approval_status: string }>('bookagent_job_meta', {
        filters: [{ column: 'created_at', operator: 'gte', value: since }],
        select: 'approval_status',
      });
      const total = rows.length;
      const completed = rows.filter((r) => r.approval_status === 'published' || r.approval_status === 'final_approved').length;
      const failed = rows.filter((r) => r.approval_status === 'failed').length;
      jobs24h = { total, completed, failed, failureRate: total > 0 ? Math.round((failed / total) * 100) : 0 };
    } catch { /* graceful */ }
  }

  // Publication stats (last 24h)
  let publications24h = { total: 0, succeeded: 0, failed: 0, failureRate: 0 };
  if (supabase) {
    const since = new Date(Date.now() - 86400000).toISOString();
    try {
      const rows = await supabase.select<{ status: string }>('bookagent_publications', {
        filters: [{ column: 'created_at', operator: 'gte', value: since }],
        select: 'status',
      });
      const total = rows.length;
      const succeeded = rows.filter((r) => r.status === 'published').length;
      const failed = rows.filter((r) => r.status === 'failed').length;
      publications24h = { total, succeeded, failed, failureRate: total > 0 ? Math.round((failed / total) * 100) : 0 };
    } catch { /* graceful */ }
  }

  // Determine overall status
  let status: AdminSystemHealthSnapshot['status'] = 'healthy';
  if (!providerStatus.ai.available || queueHealth.congested) status = 'degraded';
  if (jobs24h.failureRate > 50 || !queueHealth.available) status = 'critical';

  return {
    status,
    uptimeSeconds: Math.round(process.uptime()),
    providers: {
      ai: providerStatus.ai,
      tts: providerStatus.tts,
      billing: {
        provider: billingProvider?.provider ?? 'none',
        configured: billingProvider?.configured ?? false,
      },
    },
    queue: {
      available: queueHealth.available,
      waiting: queueHealth.waiting,
      active: queueHealth.active,
      failed: queueHealth.failed,
      congested: queueHealth.congested,
    },
    persistence: {
      mode: supabase ? 'supabase' : 'memory',
      connected: !!supabase,
    },
    jobs24h,
    publications24h,
    webhooks24h: { received: 0, processed: 0, failed: 0 },
    costThisMonth: { estimatedUsd: 0, tenantCount: 0 },
    generatedAt: new Date().toISOString(),
  };
}
