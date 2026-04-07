/**
 * Metrics Collector — Observability & Alerting Engine
 *
 * Coleta e agrega métricas de todos os subsistemas:
 *   - Queue / workers
 *   - Pipeline execution
 *   - Publications
 *   - Billing webhooks
 *   - Providers (AI/TTS)
 *   - Usage / cost
 *
 * Produz um ObservabilitySnapshot consolidado.
 *
 * Parte 79: Observability & Alerting Engine
 */

import type {
  SystemMetric,
  ProviderHealth,
  ObservabilitySnapshot,
  TenantOperationalHealth,
  AlertEvent,
} from '../../domain/entities/observability.js';
import { MetricType, MetricCategory } from '../../domain/entities/observability.js';
import { getQueueHealth } from '../../observability/queue-health.js';
import { checkProviderStatus } from '../../adapters/provider-factory.js';
import { getProviderStatus as getBillingProviderStatus } from '../billing/provider-factory.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Collect Full Snapshot
// ---------------------------------------------------------------------------

/**
 * Produz um ObservabilitySnapshot consolidado do sistema.
 */
export async function collectSnapshot(
  supabase: SupabaseClient | null,
  activeAlerts: AlertEvent[] = [],
): Promise<ObservabilitySnapshot> {
  const [queue, jobMetrics, pubMetrics, renderMetrics, webhookMetrics, providers] = await Promise.all([
    getQueueHealth(),
    collectJobMetrics(supabase),
    collectPublicationMetrics(supabase),
    collectRenderMetrics(supabase),
    collectWebhookMetrics(supabase),
    collectProviderHealth(),
  ]);

  // Determine overall status
  let status: ObservabilitySnapshot['status'] = 'healthy';
  if (jobMetrics.failureRate > 20 || queue.congested || providers.some((p) => !p.available)) {
    status = 'degraded';
  }
  if (jobMetrics.failureRate > 50 || !queue.available || activeAlerts.some((a) => a.severity === 'critical')) {
    status = 'critical';
  }

  return {
    status,
    uptimeSeconds: Math.round(process.uptime()),
    jobs: {
      throughput24h: jobMetrics.total,
      failureRate24h: jobMetrics.failureRate,
      avgDurationMs: jobMetrics.avgDurationMs,
      inProgress: queue.active,
      queued: queue.waiting,
    },
    queue: {
      available: queue.available,
      backlog: queue.waiting + queue.delayed,
      active: queue.active,
      failed: queue.failed,
      congested: queue.congested,
      avgWaitTimeMs: 0, // computed from queue stats if available
    },
    render: renderMetrics,
    publications: pubMetrics,
    providers,
    billingWebhooks: webhookMetrics,
    cost: { estimatedTotalUsd: 0, tenantCount: 0 },
    activeAlerts,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Collect Metrics as Points
// ---------------------------------------------------------------------------

/**
 * Coleta todas as métricas como pontos individuais (para export/Prometheus).
 */
export async function collectAllMetrics(
  supabase: SupabaseClient | null,
): Promise<SystemMetric[]> {
  const now = new Date();
  const metrics: SystemMetric[] = [];

  // Queue metrics
  const queue = await getQueueHealth();
  metrics.push(
    metric('queue.backlog', MetricCategory.QUEUE, MetricType.GAUGE, queue.waiting + queue.delayed, 'count', now),
    metric('queue.active', MetricCategory.QUEUE, MetricType.GAUGE, queue.active, 'count', now),
    metric('queue.failed', MetricCategory.QUEUE, MetricType.COUNTER, queue.failed, 'count', now),
    metric('queue.capacity_pct', MetricCategory.QUEUE, MetricType.GAUGE, queue.capacityUsedPct, 'percent', now),
    metric('queue.congested', MetricCategory.QUEUE, MetricType.GAUGE, queue.congested ? 1 : 0, 'bool', now),
  );

  // Job metrics (24h)
  const jobs = await collectJobMetrics(supabase);
  metrics.push(
    metric('job.throughput_24h', MetricCategory.JOB, MetricType.COUNTER, jobs.total, 'count', now),
    metric('job.failure_rate', MetricCategory.JOB, MetricType.GAUGE, jobs.failureRate, 'percent', now),
    metric('job.avg_duration_ms', MetricCategory.JOB, MetricType.GAUGE, jobs.avgDurationMs, 'ms', now),
    metric('job.completed_24h', MetricCategory.JOB, MetricType.COUNTER, jobs.completed, 'count', now),
    metric('job.failed_24h', MetricCategory.JOB, MetricType.COUNTER, jobs.failed, 'count', now),
  );

  // Publication metrics
  const pubs = await collectPublicationMetrics(supabase);
  metrics.push(
    metric('publication.attempted_24h', MetricCategory.PUBLICATION, MetricType.COUNTER, pubs.attempted24h, 'count', now),
    metric('publication.success_rate', MetricCategory.PUBLICATION, MetricType.GAUGE, pubs.successRate, 'percent', now),
    metric('publication.failure_rate', MetricCategory.PUBLICATION, MetricType.GAUGE, 100 - pubs.successRate, 'percent', now),
  );

  // Provider metrics
  const providers = await collectProviderHealth();
  for (const p of providers) {
    metrics.push(
      metric(`provider.${p.name}.available`, MetricCategory.PROVIDER, MetricType.GAUGE, p.available ? 1 : 0, 'bool', now),
    );
  }

  // Render metrics
  const render = await collectRenderMetrics(supabase);
  metrics.push(
    metric('render.completed_24h', MetricCategory.RENDER, MetricType.COUNTER, render.completed24h, 'count', now),
    metric('render.failed_24h', MetricCategory.RENDER, MetricType.COUNTER, render.failed24h, 'count', now),
    metric('render.failure_rate', MetricCategory.RENDER, MetricType.GAUGE,
      render.completed24h + render.failed24h > 0
        ? Math.round((render.failed24h / (render.completed24h + render.failed24h)) * 100)
        : 0, 'percent', now),
  );

  // Billing webhook metrics
  const wh = await collectWebhookMetrics(supabase);
  metrics.push(
    metric('billing.webhook_received_24h', MetricCategory.BILLING, MetricType.COUNTER, wh.received24h, 'count', now),
    metric('billing.webhook_failures', MetricCategory.BILLING, MetricType.COUNTER, wh.failed24h, 'count', now),
  );

  // System
  metrics.push(
    metric('system.uptime', MetricCategory.SYSTEM, MetricType.GAUGE, Math.round(process.uptime()), 'seconds', now),
    metric('system.memory_mb', MetricCategory.SYSTEM, MetricType.GAUGE,
      Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'mb', now),
  );

  return metrics;
}

// ---------------------------------------------------------------------------
// Tenant Health
// ---------------------------------------------------------------------------

/**
 * Coleta saúde operacional por tenant.
 */
export async function collectTenantHealth(
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<TenantOperationalHealth> {
  const fallback: TenantOperationalHealth = {
    tenantId,
    jobsLast24h: 0,
    jobFailureRate: 0,
    avgJobDurationMs: 0,
    publicationSuccessRate: 100,
    publicationFailures: 0,
    estimatedCostUsd: 0,
    costLimitUsd: 0,
    costPercent: 0,
    usagePercent: 0,
    activeAlerts: 0,
    healthStatus: 'healthy',
  };

  if (!supabase) return fallback;

  const since = new Date(Date.now() - 86400000).toISOString();

  try {
    // Jobs last 24h
    const jobRows = await supabase.select<{ approval_status: string | null }>('bookagent_job_meta', {
      filters: [
        { column: 'tenant_id', operator: 'eq', value: tenantId },
        { column: 'created_at', operator: 'gte', value: since },
      ],
      select: 'approval_status',
    });

    const total = jobRows.length;
    const failed = jobRows.filter((r) => r.approval_status === 'failed').length;
    const failureRate = total > 0 ? Math.round((failed / total) * 100) : 0;

    // Publications last 24h
    const pubRows = await supabase.select<{ status: string }>('bookagent_publications', {
      filters: [
        { column: 'user_id', operator: 'eq', value: tenantId },
        { column: 'created_at', operator: 'gte', value: since },
      ],
      select: 'status',
    });

    const pubTotal = pubRows.length;
    const pubFailed = pubRows.filter((r) => r.status === 'failed').length;
    const pubSuccessRate = pubTotal > 0 ? Math.round(((pubTotal - pubFailed) / pubTotal) * 100) : 100;

    let healthStatus: TenantOperationalHealth['healthStatus'] = 'healthy';
    if (failureRate > 20 || pubFailed > 3) healthStatus = 'degraded';
    if (failureRate > 50) healthStatus = 'critical';

    return {
      tenantId,
      jobsLast24h: total,
      jobFailureRate: failureRate,
      avgJobDurationMs: 0,
      publicationSuccessRate: pubSuccessRate,
      publicationFailures: pubFailed,
      estimatedCostUsd: 0,
      costLimitUsd: 0,
      costPercent: 0,
      usagePercent: 0,
      activeAlerts: 0,
      healthStatus,
    };
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Sub-collectors
// ---------------------------------------------------------------------------

interface JobMetrics24h {
  total: number;
  completed: number;
  failed: number;
  failureRate: number;
  avgDurationMs: number;
}

async function collectJobMetrics(supabase: SupabaseClient | null): Promise<JobMetrics24h> {
  const fallback: JobMetrics24h = { total: 0, completed: 0, failed: 0, failureRate: 0, avgDurationMs: 0 };
  if (!supabase) return fallback;

  const since = new Date(Date.now() - 86400000).toISOString();
  try {
    const rows = await supabase.select<{ approval_status: string | null }>('bookagent_job_meta', {
      filters: [{ column: 'created_at', operator: 'gte', value: since }],
      select: 'approval_status',
    });

    const total = rows.length;
    const completed = rows.filter((r) =>
      r.approval_status === 'published' || r.approval_status === 'final_approved',
    ).length;
    const failed = rows.filter((r) => r.approval_status === 'failed').length;

    return {
      total,
      completed,
      failed,
      failureRate: total > 0 ? Math.round((failed / total) * 100) : 0,
      avgDurationMs: 0,
    };
  } catch {
    return fallback;
  }
}

async function collectPublicationMetrics(supabase: SupabaseClient | null) {
  const fallback = { attempted24h: 0, succeeded24h: 0, failed24h: 0, successRate: 100 };
  if (!supabase) return fallback;

  const since = new Date(Date.now() - 86400000).toISOString();
  try {
    const rows = await supabase.select<{ status: string }>('bookagent_publications', {
      filters: [{ column: 'created_at', operator: 'gte', value: since }],
      select: 'status',
    });

    const total = rows.length;
    const succeeded = rows.filter((r) => r.status === 'published').length;
    const failed = rows.filter((r) => r.status === 'failed').length;

    return {
      attempted24h: total,
      succeeded24h: succeeded,
      failed24h: failed,
      successRate: total > 0 ? Math.round((succeeded / total) * 100) : 100,
    };
  } catch {
    return fallback;
  }
}

async function collectRenderMetrics(supabase: SupabaseClient | null) {
  // Render metrics from job artifacts — simplified
  return { completed24h: 0, failed24h: 0, avgRenderTimeMs: 0 };
}

async function collectWebhookMetrics(supabase: SupabaseClient | null) {
  const fallback = { received24h: 0, processed24h: 0, failed24h: 0, successRate: 100 };
  if (!supabase) return fallback;

  const since = new Date(Date.now() - 86400000).toISOString();
  try {
    const rows = await supabase.select<{ processing_status: string }>('bookagent_webhook_events', {
      filters: [{ column: 'received_at', operator: 'gte', value: since }],
      select: 'processing_status',
    });

    const total = rows.length;
    const processed = rows.filter((r) => r.processing_status === 'applied').length;
    const failed = rows.filter((r) => r.processing_status === 'failed').length;

    return {
      received24h: total,
      processed24h: processed,
      failed24h: failed,
      successRate: total > 0 ? Math.round((processed / total) * 100) : 100,
    };
  } catch {
    return fallback;
  }
}

async function collectProviderHealth(): Promise<ProviderHealth[]> {
  const status = checkProviderStatus();
  const now = new Date().toISOString();

  const providers: ProviderHealth[] = [
    {
      name: status.ai.provider,
      available: status.ai.available,
      latencyMs: null,
      lastCheckAt: now,
      errorRate: 0,
      consecutiveFailures: 0,
    },
    {
      name: status.tts.provider,
      available: status.tts.available,
      latencyMs: null,
      lastCheckAt: now,
      errorRate: 0,
      consecutiveFailures: 0,
    },
  ];

  // Billing provider
  const billingProviders = getBillingProviderStatus();
  const activeBilling = billingProviders.find((p) => p.configured);
  if (activeBilling) {
    providers.push({
      name: `billing:${activeBilling.provider}`,
      available: activeBilling.configured,
      latencyMs: null,
      lastCheckAt: now,
      errorRate: 0,
      consecutiveFailures: 0,
    });
  }

  return providers;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function metric(
  name: string,
  category: MetricCategory,
  type: MetricType,
  value: number,
  unit: string,
  timestamp: Date,
  tenantId?: string,
): SystemMetric {
  return { name, category, type, value, unit, tenantId, timestamp };
}
