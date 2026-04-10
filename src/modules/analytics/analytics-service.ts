/**
 * Analytics Service — Reporting & Analytics
 *
 * Serviços de consulta analítica. Queries diretas ao Supabase com
 * filtros temporais e agregação em memória.
 *
 * Separação admin/customer:
 *   - Admin: sem tenantId → analytics globais
 *   - Customer: com tenantId → analytics do próprio tenant
 *
 * Parte 80: Reporting & Analytics
 */

import type {
  AnalyticsTimeFilter,
  AnalyticsTimeSeries,
  AnalyticsTimeSeriesPoint,
  JobAnalyticsSummary,
  ContentAnalyticsSummary,
  PublicationAnalyticsSummary,
  TenantAnalyticsSummary,
  BillingAnalyticsSummary,
  LearningAnalyticsSummary,
  AnalyticsDashboardSnapshot,
} from '../../domain/entities/analytics.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Default Filter
// ---------------------------------------------------------------------------

/** Cria filtro padrão (últimos 30 dias, granularidade diária) */
export function defaultTimeFilter(tenantId?: string): AnalyticsTimeFilter {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86400000);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    granularity: 'day',
    tenantId,
  };
}

// ---------------------------------------------------------------------------
// Job Analytics
// ---------------------------------------------------------------------------

export async function getJobAnalytics(
  filter: AnalyticsTimeFilter,
  supabase: SupabaseClient | null,
): Promise<JobAnalyticsSummary> {
  const empty: JobAnalyticsSummary = {
    period: { from: filter.from, to: filter.to },
    totalJobs: 0, completedJobs: 0, failedJobs: 0,
    successRate: 0, failureRate: 0,
    avgDurationMs: 0, p95DurationMs: 0,
    byStatus: [], byInputType: [],
    throughputSeries: { name: 'throughput', unit: 'jobs', points: [], total: 0, average: 0 },
  };

  if (!supabase) return empty;

  try {
    const filters: Array<{ column: string; operator: 'gte' | 'lte' | 'eq'; value: string }> = [
      { column: 'created_at', operator: 'gte', value: filter.from },
      { column: 'created_at', operator: 'lte', value: filter.to },
    ];
    if (filter.tenantId) {
      filters.push({ column: 'tenant_id', operator: 'eq', value: filter.tenantId });
    }

    const rows = await supabase.select<{
      approval_status: string | null;
      created_at: string;
    }>('bookagent_job_meta', { filters, select: 'approval_status,created_at' });

    const total = rows.length;
    const completed = rows.filter((r) =>
      r.approval_status === 'published' || r.approval_status === 'final_approved',
    ).length;
    const failed = rows.filter((r) => r.approval_status === 'failed').length;

    // By status
    const statusMap = new Map<string, number>();
    for (const r of rows) {
      const s = r.approval_status ?? 'unknown';
      statusMap.set(s, (statusMap.get(s) ?? 0) + 1);
    }

    // Time series
    const seriesMap = new Map<string, number>();
    for (const r of rows) {
      const key = periodKey(r.created_at, filter.granularity);
      seriesMap.set(key, (seriesMap.get(key) ?? 0) + 1);
    }
    const points = sortedPoints(seriesMap);

    return {
      period: { from: filter.from, to: filter.to },
      totalJobs: total,
      completedJobs: completed,
      failedJobs: failed,
      successRate: total > 0 ? pct(completed, total) : 0,
      failureRate: total > 0 ? pct(failed, total) : 0,
      avgDurationMs: 0,
      p95DurationMs: 0,
      byStatus: [...statusMap.entries()].map(([status, count]) => ({ status, count })),
      byInputType: [],
      throughputSeries: {
        name: 'throughput',
        unit: 'jobs',
        points,
        total,
        average: points.length > 0 ? Math.round(total / points.length) : 0,
      },
    };
  } catch (err) {
    logger.warn(`[Analytics] getJobAnalytics failed: ${err}`);
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Content Analytics
// ---------------------------------------------------------------------------

export async function getContentAnalytics(
  filter: AnalyticsTimeFilter,
  supabase: SupabaseClient | null,
): Promise<ContentAnalyticsSummary> {
  const empty: ContentAnalyticsSummary = {
    period: { from: filter.from, to: filter.to },
    totalArtifacts: 0, byFormat: [], byType: [],
    avgQualityScore: null, totalVariants: 0, totalThumbnails: 0, topPresets: [],
  };

  if (!supabase) return empty;

  try {
    const filters: Array<{ column: string; operator: 'gte' | 'lte'; value: string }> = [
      { column: 'created_at', operator: 'gte', value: filter.from },
      { column: 'created_at', operator: 'lte', value: filter.to },
    ];

    const rows = await supabase.select<{
      artifact_type: string;
      export_format: string | null;
    }>('bookagent_job_artifacts', { filters, select: 'artifact_type,export_format' });

    const typeMap = new Map<string, number>();
    const formatMap = new Map<string, number>();

    for (const r of rows) {
      typeMap.set(r.artifact_type, (typeMap.get(r.artifact_type) ?? 0) + 1);
      const fmt = r.export_format ?? 'unknown';
      formatMap.set(fmt, (formatMap.get(fmt) ?? 0) + 1);
    }

    return {
      period: { from: filter.from, to: filter.to },
      totalArtifacts: rows.length,
      byFormat: [...formatMap.entries()].map(([format, count]) => ({ format, count }))
        .sort((a, b) => b.count - a.count),
      byType: [...typeMap.entries()].map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      avgQualityScore: null,
      totalVariants: 0,
      totalThumbnails: 0,
      topPresets: [],
    };
  } catch (err) {
    logger.warn(`[Analytics] getContentAnalytics failed: ${err}`);
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Publication Analytics
// ---------------------------------------------------------------------------

export async function getPublicationAnalytics(
  filter: AnalyticsTimeFilter,
  supabase: SupabaseClient | null,
): Promise<PublicationAnalyticsSummary> {
  const empty: PublicationAnalyticsSummary = {
    period: { from: filter.from, to: filter.to },
    totalAttempted: 0, totalSucceeded: 0, totalFailed: 0, successRate: 0,
    byPlatform: [],
    publicationSeries: { name: 'publications', unit: 'count', points: [], total: 0, average: 0 },
  };

  if (!supabase) return empty;

  try {
    const filters: Array<{ column: string; operator: 'gte' | 'lte' | 'eq'; value: string }> = [
      { column: 'created_at', operator: 'gte', value: filter.from },
      { column: 'created_at', operator: 'lte', value: filter.to },
    ];
    if (filter.tenantId) {
      filters.push({ column: 'user_id', operator: 'eq', value: filter.tenantId });
    }

    const rows = await supabase.select<{
      platform: string;
      status: string;
      created_at: string;
    }>('bookagent_publications', { filters, select: 'platform,status,created_at' });

    const total = rows.length;
    const succeeded = rows.filter((r) => r.status === 'published').length;
    const failed = rows.filter((r) => r.status === 'failed').length;

    // By platform
    const platMap = new Map<string, { total: number; succeeded: number; failed: number }>();
    for (const r of rows) {
      const entry = platMap.get(r.platform) ?? { total: 0, succeeded: 0, failed: 0 };
      entry.total++;
      if (r.status === 'published') entry.succeeded++;
      if (r.status === 'failed') entry.failed++;
      platMap.set(r.platform, entry);
    }

    // Series
    const seriesMap = new Map<string, number>();
    for (const r of rows) {
      const key = periodKey(r.created_at, filter.granularity);
      seriesMap.set(key, (seriesMap.get(key) ?? 0) + 1);
    }

    return {
      period: { from: filter.from, to: filter.to },
      totalAttempted: total,
      totalSucceeded: succeeded,
      totalFailed: failed,
      successRate: total > 0 ? pct(succeeded, total) : 0,
      byPlatform: [...platMap.entries()].map(([platform, v]) => ({
        platform, ...v, rate: v.total > 0 ? pct(v.succeeded, v.total) : 0,
      })),
      publicationSeries: {
        name: 'publications', unit: 'count',
        points: sortedPoints(seriesMap), total, average: 0,
      },
    };
  } catch (err) {
    logger.warn(`[Analytics] getPublicationAnalytics failed: ${err}`);
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Tenant Analytics (admin only)
// ---------------------------------------------------------------------------

export async function getTenantAnalytics(
  filter: AnalyticsTimeFilter,
  supabase: SupabaseClient | null,
): Promise<TenantAnalyticsSummary> {
  const empty: TenantAnalyticsSummary = {
    period: { from: filter.from, to: filter.to },
    activeTenants: 0, newTenants: 0, topByUsage: [], byPlan: [],
  };

  if (!supabase) return empty;

  try {
    const rows = await supabase.select<{
      tenant_id: string | null;
      user_id: string | null;
      plan_type: string | null;
      created_at: string;
    }>('bookagent_job_meta', {
      filters: [
        { column: 'created_at', operator: 'gte', value: filter.from },
        { column: 'created_at', operator: 'lte', value: filter.to },
      ],
      select: 'tenant_id,user_id,plan_type,created_at',
    });

    // Aggregate by tenant
    const tenantMap = new Map<string, { count: number; plan: string }>();
    for (const r of rows) {
      const tid = r.tenant_id ?? r.user_id ?? 'unknown';
      const entry = tenantMap.get(tid) ?? { count: 0, plan: r.plan_type ?? 'starter' };
      entry.count++;
      tenantMap.set(tid, entry);
    }

    // By plan
    const planMap = new Map<string, number>();
    for (const [, v] of tenantMap) {
      planMap.set(v.plan, (planMap.get(v.plan) ?? 0) + 1);
    }

    // Top by usage
    const topByUsage = [...tenantMap.entries()]
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([tenantId, v]) => ({ tenantId, jobCount: v.count, planTier: v.plan }));

    return {
      period: { from: filter.from, to: filter.to },
      activeTenants: tenantMap.size,
      newTenants: 0, // Would need first-seen tracking
      topByUsage,
      byPlan: [...planMap.entries()].map(([plan, count]) => ({ plan, count })),
    };
  } catch (err) {
    logger.warn(`[Analytics] getTenantAnalytics failed: ${err}`);
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Billing Analytics (admin only)
// ---------------------------------------------------------------------------

export async function getBillingAnalytics(
  filter: AnalyticsTimeFilter,
  supabase: SupabaseClient | null,
): Promise<BillingAnalyticsSummary> {
  const empty: BillingAnalyticsSummary = {
    period: { from: filter.from, to: filter.to },
    estimatedRevenueBRL: 0, estimatedCostUsd: 0,
    activeSubscriptions: 0, byStatus: [], byPlan: [],
    cancellations: 0, upgrades: 0, downgrades: 0,
  };

  if (!supabase) return empty;

  try {
    // Subscriptions
    const subs = await supabase.select<{
      plan_tier: string;
      status: string;
      price_monthly_brl: number;
    }>('bookagent_subscriptions', { select: 'plan_tier,status,price_monthly_brl' });

    const statusMap = new Map<string, number>();
    const planMap = new Map<string, { count: number; revenue: number }>();
    let totalRevenue = 0;

    for (const s of subs) {
      statusMap.set(s.status, (statusMap.get(s.status) ?? 0) + 1);
      const entry = planMap.get(s.plan_tier) ?? { count: 0, revenue: 0 };
      entry.count++;
      if (s.status === 'active' || s.status === 'trial') {
        entry.revenue += s.price_monthly_brl;
        totalRevenue += s.price_monthly_brl;
      }
      planMap.set(s.plan_tier, entry);
    }

    // Billing events in period
    const events = await supabase.select<{
      event_type: string;
    }>('bookagent_billing_events', {
      filters: [
        { column: 'created_at', operator: 'gte', value: filter.from },
        { column: 'created_at', operator: 'lte', value: filter.to },
      ],
      select: 'event_type',
    });

    const upgrades = events.filter((e) => e.event_type === 'plan_upgraded').length;
    const downgrades = events.filter((e) => e.event_type === 'plan_downgraded').length;

    return {
      period: { from: filter.from, to: filter.to },
      estimatedRevenueBRL: totalRevenue,
      estimatedCostUsd: 0,
      activeSubscriptions: subs.filter((s) => s.status === 'active' || s.status === 'trial').length,
      byStatus: [...statusMap.entries()].map(([status, count]) => ({ status, count })),
      byPlan: [...planMap.entries()].map(([plan, v]) => ({
        plan, count: v.count, revenueBRL: v.revenue,
      })),
      cancellations: events.filter((e) =>
        e.event_type === 'plan_downgraded' || e.event_type === 'trial_ended',
      ).length,
      upgrades,
      downgrades,
    };
  } catch (err) {
    logger.warn(`[Analytics] getBillingAnalytics failed: ${err}`);
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Learning Analytics
// ---------------------------------------------------------------------------

export async function getLearningAnalytics(
  filter: AnalyticsTimeFilter,
  supabase: SupabaseClient | null,
): Promise<LearningAnalyticsSummary> {
  const empty: LearningAnalyticsSummary = {
    period: { from: filter.from, to: filter.to },
    totalSignals: 0, activeRules: 0, rulesApplied: 0, ruleSuccessRate: 0,
    bySource: [], byCategory: [],
  };

  if (!supabase) return empty;

  try {
    const rows = await supabase.select<{
      type: string;
      key: string;
      data: string;
    }>('bookagent_learning', {
      filters: [
        { column: 'created_at', operator: 'gte', value: filter.from },
        { column: 'created_at', operator: 'lte', value: filter.to },
      ],
      select: 'type,key,data',
    });

    const signals = rows.filter((r) => r.type === 'signal');
    const rules = rows.filter((r) => r.type === 'rule');

    // By source (from key: "scoring:dimension", "experiment:winner", etc.)
    const sourceMap = new Map<string, number>();
    for (const s of signals) {
      const source = s.key.split(':')[0] ?? 'unknown';
      sourceMap.set(source, (sourceMap.get(source) ?? 0) + 1);
    }

    return {
      period: { from: filter.from, to: filter.to },
      totalSignals: signals.length,
      activeRules: rules.length,
      rulesApplied: 0,
      ruleSuccessRate: 0,
      bySource: [...sourceMap.entries()].map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count),
      byCategory: [],
    };
  } catch (err) {
    logger.warn(`[Analytics] getLearningAnalytics failed: ${err}`);
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Dashboard Snapshot (consolidated)
// ---------------------------------------------------------------------------

export async function getAnalyticsDashboard(
  filter: AnalyticsTimeFilter,
  supabase: SupabaseClient | null,
): Promise<AnalyticsDashboardSnapshot> {
  const [jobs, publications, tenants, billing] = await Promise.all([
    getJobAnalytics(filter, supabase),
    getPublicationAnalytics(filter, supabase),
    getTenantAnalytics(filter, supabase),
    getBillingAnalytics(filter, supabase),
  ]);

  return {
    period: { from: filter.from, to: filter.to },
    granularity: filter.granularity,
    kpis: {
      totalJobs: jobs.totalJobs,
      successRate: jobs.successRate,
      avgDurationMs: jobs.avgDurationMs,
      totalPublications: publications.totalAttempted,
      publicationSuccessRate: publications.successRate,
      activeTenants: tenants.activeTenants,
      estimatedRevenueBRL: billing.estimatedRevenueBRL,
      estimatedCostUsd: billing.estimatedCostUsd,
    },
    jobs,
    publications,
    tenants,
    billing,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function periodKey(isoDate: string, granularity: AnalyticsTimeFilter['granularity']): string {
  const d = new Date(isoDate);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  switch (granularity) {
    case 'day':
      return `${y}-${m}-${day}`;
    case 'week': {
      // ISO week approximation
      const jan1 = new Date(y, 0, 1);
      const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
      return `${y}-W${String(week).padStart(2, '0')}`;
    }
    case 'month':
      return `${y}-${m}`;
    default:
      return `${y}-${m}-${day}`;
  }
}

function sortedPoints(map: Map<string, number>): AnalyticsTimeSeriesPoint[] {
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, value]) => ({ period, value }));
}

function pct(part: number, total: number): number {
  return Math.round((part / total) * 100);
}
