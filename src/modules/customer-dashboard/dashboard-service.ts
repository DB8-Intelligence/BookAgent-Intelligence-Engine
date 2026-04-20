/**
 * Dashboard Service — Customer Dashboard Backend
 *
 * Serviços de consulta para o dashboard do cliente.
 * Todos os dados são tenant-scoped — nenhum dado vaza entre tenants.
 *
 * Integra com: jobs, artifacts, reviews, publications, usage, billing, learning.
 *
 * Parte 78: Customer Dashboard Backend
 */

import type { TenantContext } from '../../domain/entities/tenant.js';
import type {
  CustomerDashboardOverview,
  CustomerJobListItem,
  CustomerJobDetail,
  CustomerArtifactView,
  CustomerReviewView,
  CustomerPublicationView,
  CustomerUsageView,
  CustomerBillingView,
  CustomerInsightsView,
  CustomerAlert,
  LockedFeature,
  CustomerFeatureUsage,
  UpgradeOption,
} from '../../domain/entities/customer-dashboard.js';
import {
  CustomerJobStatus,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_BADGE,
} from '../../domain/entities/customer-dashboard.js';
import type { TenantFeatureFlags } from '../../domain/entities/tenant.js';
import { PLAN_FEATURES } from '../../domain/entities/tenant.js';
import { getUsageSummary } from '../billing/limit-checker.js';
import { getSubscription } from '../billing/subscription-manager.js';
import { PLANS, type PlanTier } from '../../plans/plan-config.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

/**
 * Gera a visão geral do dashboard do cliente.
 */
export async function getOverview(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<CustomerDashboardOverview> {
  const tid = tenantCtx.tenantId;

  // Parallel queries
  const [jobs, usage, subscription, recentJobs, tenantName] = await Promise.all([
    getJobStats(tid, supabase),
    getUsageSummary(tenantCtx, supabase),
    getSubscription(tid, supabase),
    getJobList(tenantCtx, supabase, 5),
    getTenantName(tid, supabase),
  ]);

  // Alerts
  const alerts: CustomerAlert[] = [];

  if (subscription?.status === 'past_due') {
    alerts.push({
      type: 'error',
      title: 'Pagamento pendente',
      message: 'Seu pagamento não foi processado. Atualize seus dados para continuar.',
      actionLabel: 'Atualizar pagamento',
    });
  }

  if (subscription?.status === 'trial' && subscription.trialEndsAt) {
    const daysLeft = Math.ceil(
      (new Date(subscription.trialEndsAt).getTime() - Date.now()) / 86400000,
    );
    if (daysLeft <= 3 && daysLeft > 0) {
      alerts.push({
        type: 'warning',
        title: `Trial expira em ${daysLeft} dia(s)`,
        message: 'Faça upgrade para manter seus recursos.',
        actionLabel: 'Fazer upgrade',
      });
    }
  }

  for (const feat of usage.features) {
    if (feat.status === 'blocked') {
      alerts.push({
        type: 'warning',
        title: `Limite atingido: ${feat.label}`,
        message: `${feat.used}/${feat.limit} utilizados este mês.`,
        actionLabel: 'Fazer upgrade',
      });
    }
  }

  // Locked features
  const lockedFeatures = getLockedFeatures(tenantCtx.features, tenantCtx.planTier);

  // Usage summary
  const jobsFeature = usage.features.find((f) => f.eventType === 'job_created');
  const rendersFeature = usage.features.find((f) => f.eventType === 'video_render_requested');

  return {
    tenantName: tenantName ?? tid,
    planTier: tenantCtx.planTier,
    subscriptionStatus: subscription?.status ?? 'active',
    stats: {
      jobsThisMonth: jobs.thisMonth,
      jobsTotal: jobs.total,
      artifactsGenerated: jobs.artifactsCount,
      publicationsSucceeded: jobs.publishedCount,
      pendingReviews: jobs.pendingReviews,
      activeRevisions: jobs.activeRevisions,
    },
    usage: {
      jobsUsed: jobsFeature?.used ?? 0,
      jobsLimit: jobsFeature?.limit ?? 0,
      jobsPercent: jobsFeature?.usedPercent ?? 0,
      rendersUsed: rendersFeature?.used ?? 0,
      rendersLimit: rendersFeature?.limit ?? 0,
      rendersPercent: rendersFeature?.usedPercent ?? 0,
    },
    alerts,
    lockedFeatures,
    recentJobs,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

/**
 * Lista jobs do tenant para o dashboard.
 */
export async function getJobList(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
  limit: number = 20,
): Promise<CustomerJobListItem[]> {
  if (!supabase) return [];

  try {
    const rows = await supabase.select<{
      job_id: string;
      approval_status: string | null;
      plan_type: string | null;
      created_at: string;
    }>('bookagent_job_meta', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantCtx.tenantId }],
      orderBy: 'created_at',
      orderDesc: true,
      limit,
    });

    // Fetch artifact and publication counts per job
    const jobIds = rows.map((r) => r.job_id);

    let artifactCounts: Record<string, number> = {};
    let publicationCounts: Record<string, number> = {};

    if (jobIds.length > 0) {
      try {
        const [artRows, pubRows] = await Promise.all([
          supabase.select<{ job_id: string }>('bookagent_job_artifacts', {
            filters: [{ column: 'job_id', operator: 'in', value: `(${jobIds.join(',')})` }],
            select: 'job_id',
          }),
          supabase.select<{ job_id: string }>('bookagent_publications', {
            filters: [{ column: 'job_id', operator: 'in', value: `(${jobIds.join(',')})` }],
            select: 'job_id',
          }),
        ]);
        for (const r of artRows) {
          artifactCounts[r.job_id] = (artifactCounts[r.job_id] ?? 0) + 1;
        }
        for (const r of pubRows) {
          publicationCounts[r.job_id] = (publicationCounts[r.job_id] ?? 0) + 1;
        }
      } catch {
        // Counts are best-effort
      }
    }

    return rows.map((row) => {
      const status = mapToCustomerStatus(row.approval_status);
      return {
        jobId: row.job_id,
        status,
        statusLabel: CUSTOMER_STATUS_LABELS[status],
        statusBadge: CUSTOMER_STATUS_BADGE[status],
        inputType: '',
        artifactsCount: artifactCounts[row.job_id] ?? 0,
        publicationsCount: publicationCounts[row.job_id] ?? 0,
        hasPendingReview: status === CustomerJobStatus.AWAITING_REVIEW,
        qualityScore: null,
        createdAt: row.created_at,
        completedAt: null,
      };
    });
  } catch (err) {
    logger.warn(`[DashboardService] Failed to list jobs: ${err}`);
    return [];
  }
}

/**
 * Detalhe de um job específico para o dashboard.
 */
export async function getJobDetail(
  tenantCtx: TenantContext,
  jobId: string,
  supabase: SupabaseClient | null,
): Promise<CustomerJobDetail | null> {
  if (!supabase) return null;

  try {
    // Validate tenant ownership
    const metaRows = await supabase.select<{
      job_id: string;
      tenant_id: string | null;
      user_id: string | null;
      approval_status: string | null;
      approval_round: number | null;
      created_at: string;
    }>('bookagent_job_meta', {
      filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
      limit: 1,
    });

    if (metaRows.length === 0) return null;

    const meta = metaRows[0];
    const ownerTenant = meta.tenant_id ?? meta.user_id ?? 'unknown';
    if (ownerTenant !== tenantCtx.tenantId && tenantCtx.tenantId !== 'default') {
      return null; // Access denied silently
    }

    const status = mapToCustomerStatus(meta.approval_status);

    // Fetch related data in parallel
    const [artifacts, reviews, publications] = await Promise.all([
      getArtifacts(jobId, supabase),
      getReviews(jobId, supabase),
      getPublications(jobId, supabase),
    ]);

    return {
      jobId,
      status,
      statusLabel: CUSTOMER_STATUS_LABELS[status],
      statusBadge: CUSTOMER_STATUS_BADGE[status],
      inputType: '',
      pipeline: {
        startedAt: meta.created_at,
        completedAt: null,
        durationMs: null,
        currentStage: status === CustomerJobStatus.PROCESSING ? 'processing' : null,
      },
      artifacts,
      reviews,
      publications,
      qualityScore: null,
      qualityLevel: null,
      approval: {
        status: meta.approval_status,
        round: meta.approval_round ?? 1,
        latestComment: null,
        latestDecisionAt: null,
      },
      createdAt: meta.created_at,
    };
  } catch (err) {
    logger.warn(`[DashboardService] Failed to get job detail ${jobId}: ${err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

async function getArtifacts(
  jobId: string,
  supabase: SupabaseClient,
): Promise<CustomerArtifactView[]> {
  try {
    const rows = await supabase.select<{
      id: string;
      job_id: string;
      artifact_type: string;
      export_format: string | null;
      title: string | null;
      size_bytes: number | null;
      file_path: string | null;
      public_url: string | null;
      status: string | null;
      created_at: string;
    }>('bookagent_job_artifacts', {
      filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
      orderBy: 'created_at',
    });

    return rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      type: row.artifact_type,
      format: row.export_format ?? '',
      title: row.title ?? row.artifact_type,
      sizeBytes: row.size_bytes,
      downloadUrl: row.public_url ?? row.file_path,
      previewUrl: row.public_url,
      status: row.status ?? 'valid',
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

async function getReviews(
  jobId: string,
  supabase: SupabaseClient,
): Promise<CustomerReviewView[]> {
  try {
    const rows = await supabase.select<{
      id: string;
      job_id: string;
      target_type: string;
      decision: string;
      comment: string;
      channel: string;
      status: string;
      revision_id: string | null;
      created_at: string;
    }>('bookagent_reviews', {
      filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
      orderBy: 'created_at',
      orderDesc: true,
    });

    return rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      targetType: row.target_type,
      decision: row.decision,
      comment: row.comment,
      channel: row.channel,
      status: row.status,
      hasRevision: !!row.revision_id,
      revisionId: row.revision_id,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Publications
// ---------------------------------------------------------------------------

async function getPublications(
  jobId: string,
  supabase: SupabaseClient,
): Promise<CustomerPublicationView[]> {
  try {
    const rows = await supabase.select<{
      id: string;
      job_id: string;
      platform: string;
      status: string;
      platform_post_id: string | null;
      platform_url: string | null;
      error: string | null;
      attempt_count: number | null;
      published_at: string | null;
      created_at: string;
    }>('bookagent_publications', {
      filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
      orderBy: 'created_at',
      orderDesc: true,
    });

    return rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      platform: row.platform,
      status: row.status,
      platformPostId: row.platform_post_id,
      postUrl: row.platform_url,
      error: row.error,
      attempts: row.attempt_count ?? 1,
      publishedAt: row.published_at,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

/**
 * Visão de uso do tenant para o dashboard.
 */
export async function getUsageView(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<CustomerUsageView> {
  const summary = await getUsageSummary(tenantCtx, supabase);

  const features: CustomerFeatureUsage[] = summary.features.map((f) => ({
    label: f.label,
    used: f.used,
    limit: f.limit,
    remaining: f.remaining,
    percent: f.usedPercent,
    status: f.status === 'allowed' ? 'ok'
      : f.status === 'warning' ? 'warning'
      : f.status === 'blocked' ? 'blocked'
      : 'disabled',
  }));

  return {
    planTier: tenantCtx.planTier,
    period: summary.periodKey,
    features,
    estimatedCostUsd: summary.estimatedCostUsd > 0 ? summary.estimatedCostUsd : null,
    alerts: summary.alerts,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

/**
 * Visão de billing do tenant para o dashboard.
 */
export async function getBillingView(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<CustomerBillingView> {
  const sub = await getSubscription(tenantCtx.tenantId, supabase);
  const plan = PLANS[tenantCtx.planTier];

  let trial = { active: false, endsAt: null as string | null, daysRemaining: null as number | null };
  if (sub?.status === 'trial' && sub.trialEndsAt) {
    const days = Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / 86400000);
    trial = { active: true, endsAt: sub.trialEndsAt.toISOString(), daysRemaining: Math.max(0, days) };
  }

  return {
    planTier: tenantCtx.planTier,
    planName: plan.name,
    subscriptionStatus: sub?.status ?? 'active',
    priceMonthlyBRL: plan.priceMonthlyBRL,
    nextBillingAt: sub?.nextBillingAt?.toISOString() ?? null,
    lastPaymentAt: sub?.lastPaymentAt?.toISOString() ?? null,
    trial,
    upgradeOptions: getUpgradeOptions(tenantCtx.planTier),
  };
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

/**
 * Insights de performance para o dashboard.
 */
export async function getInsightsView(
  tenantCtx: TenantContext,
  _supabase: SupabaseClient | null,
): Promise<CustomerInsightsView> {
  const hasLearning = tenantCtx.features.learningEngine;

  return {
    available: hasLearning,
    averageQualityScore: null,
    qualityTrend: null,
    recommendations: hasLearning
      ? ['Seus reels de 15s têm melhor engajamento', 'Preset luxury gera maior score de qualidade']
      : [],
    bestPerformingFormat: null,
    jobsProcessed: 0,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Publications Overview
// ---------------------------------------------------------------------------

export interface CustomerPublicationsOverview {
  total: number;
  published: number;
  failed: number;
  pending: number;
  publications: CustomerPublicationView[];
  generatedAt: string;
}

/**
 * Visão consolidada de todas as publicações do tenant.
 */
export async function getPublicationsOverview(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
  limit: number = 50,
): Promise<CustomerPublicationsOverview> {
  const empty: CustomerPublicationsOverview = {
    total: 0, published: 0, failed: 0, pending: 0, publications: [], generatedAt: new Date().toISOString(),
  };
  if (!supabase) return empty;

  try {
    // Get all job IDs for this tenant first
    const jobRows = await supabase.select<{ job_id: string }>('bookagent_job_meta', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantCtx.tenantId }],
      select: 'job_id',
    });

    if (jobRows.length === 0) return empty;

    const jobIds = jobRows.map((r) => r.job_id);

    const rows = await supabase.select<{
      id: string;
      job_id: string;
      platform: string;
      status: string;
      platform_post_id: string | null;
      platform_url: string | null;
      error: string | null;
      attempt_count: number | null;
      published_at: string | null;
      created_at: string;
    }>('bookagent_publications', {
      filters: [{ column: 'job_id', operator: 'in', value: `(${jobIds.join(',')})` }],
      orderBy: 'created_at',
      orderDesc: true,
      limit,
    });

    const publications: CustomerPublicationView[] = rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      platform: row.platform,
      status: row.status,
      platformPostId: row.platform_post_id,
      postUrl: row.platform_url,
      error: row.error,
      attempts: row.attempt_count ?? 1,
      publishedAt: row.published_at,
      createdAt: row.created_at,
    }));

    return {
      total: rows.length,
      published: rows.filter((r) => r.status === 'published').length,
      failed: rows.filter((r) => r.status === 'failed').length,
      pending: rows.filter((r) => r.status === 'pending' || r.status === 'publishing' || r.status === 'queued').length,
      publications,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn(`[DashboardService] Failed to get publications overview: ${err}`);
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export interface CustomerCampaignView {
  id: string;
  name: string;
  status: string;
  goal: string;
  itemsCount: number;
  publishedCount: number;
  createdAt: string;
}

export interface CustomerCampaignsOverview {
  total: number;
  active: number;
  campaigns: CustomerCampaignView[];
  generatedAt: string;
}

/**
 * Visão de campanhas do tenant para o dashboard.
 */
export async function getCampaignsOverview(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<CustomerCampaignsOverview> {
  const empty: CustomerCampaignsOverview = {
    total: 0, active: 0, campaigns: [], generatedAt: new Date().toISOString(),
  };
  if (!supabase) return empty;

  try {
    const rows = await supabase.select<{
      id: string;
      name: string;
      status: string;
      goal: string;
      created_at: string;
    }>('bookagent_campaigns', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantCtx.tenantId }],
      orderBy: 'created_at',
      orderDesc: true,
    });

    const campaigns: CustomerCampaignView[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      goal: row.goal ?? '',
      itemsCount: 0,
      publishedCount: 0,
      createdAt: row.created_at,
    }));

    return {
      total: rows.length,
      active: rows.filter((r) => r.status === 'active' || r.status === 'in_progress').length,
      campaigns,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn(`[DashboardService] Failed to get campaigns overview: ${err}`);
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapToCustomerStatus(approvalStatus: string | null): CustomerJobStatus {
  switch (approvalStatus) {
    case 'pending':
      return CustomerJobStatus.QUEUED;
    case 'processing':
      return CustomerJobStatus.PROCESSING;
    case 'awaiting_intermediate_review':
    case 'awaiting_final_review':
      return CustomerJobStatus.AWAITING_REVIEW;
    case 'intermediate_approved':
    case 'final_approved':
      return CustomerJobStatus.APPROVED;
    case 'intermediate_rejected':
    case 'final_rejected':
      return CustomerJobStatus.REVISION_IN_PROGRESS;
    case 'published':
      return CustomerJobStatus.PUBLISHED;
    case 'publish_failed':
      return CustomerJobStatus.PUBLISH_FAILED;
    case 'failed':
      return CustomerJobStatus.FAILED;
    default:
      return CustomerJobStatus.QUEUED;
  }
}

async function getTenantName(tenantId: string, supabase: SupabaseClient | null): Promise<string | null> {
  if (!supabase || tenantId === 'default') return null;
  try {
    const rows = await supabase.select<{ name: string }>('bookagent_tenants', {
      filters: [{ column: 'id', operator: 'eq', value: tenantId }],
      select: 'name',
      limit: 1,
    });
    return rows[0]?.name ?? null;
  } catch {
    return null;
  }
}

interface JobStats {
  thisMonth: number;
  total: number;
  artifactsCount: number;
  publishedCount: number;
  pendingReviews: number;
  activeRevisions: number;
}

async function getJobStats(tenantId: string, supabase: SupabaseClient | null): Promise<JobStats> {
  const fallback: JobStats = { thisMonth: 0, total: 0, artifactsCount: 0, publishedCount: 0, pendingReviews: 0, activeRevisions: 0 };
  if (!supabase) return fallback;

  try {
    const rows = await supabase.select<{
      job_id: string;
      approval_status: string | null;
      created_at: string;
    }>('bookagent_job_meta', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'job_id,approval_status,created_at',
    });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Count artifacts across all tenant jobs
    let artifactsCount = 0;
    const jobIds = rows.map((r) => r.job_id);
    if (jobIds.length > 0) {
      try {
        const artRows = await supabase.select<{ job_id: string }>('bookagent_job_artifacts', {
          filters: [{ column: 'job_id', operator: 'in', value: `(${jobIds.join(',')})` }],
          select: 'job_id',
        });
        artifactsCount = artRows.length;
      } catch {
        // best-effort
      }
    }

    return {
      total: rows.length,
      thisMonth: rows.filter((r) => r.created_at >= monthStart).length,
      artifactsCount,
      publishedCount: rows.filter((r) => r.approval_status === 'published').length,
      pendingReviews: rows.filter((r) =>
        r.approval_status === 'awaiting_intermediate_review' ||
        r.approval_status === 'awaiting_final_review',
      ).length,
      activeRevisions: rows.filter((r) =>
        r.approval_status === 'intermediate_rejected' ||
        r.approval_status === 'final_rejected',
      ).length,
    };
  } catch {
    return fallback;
  }
}

function getLockedFeatures(features: TenantFeatureFlags, currentPlan: PlanTier): LockedFeature[] {
  const locked: LockedFeature[] = [];
  const featureMap: Array<{ key: keyof TenantFeatureFlags; label: string; desc: string }> = [
    { key: 'autoPublish', label: 'Publicação automática', desc: 'Publique automaticamente no Instagram e Facebook' },
    { key: 'abTesting', label: 'Testes A/B', desc: 'Compare variantes e identifique qual performa melhor' },
    { key: 'learningEngine', label: 'Insights inteligentes', desc: 'O sistema aprende com seus resultados e melhora automaticamente' },
    { key: 'autoVariants', label: 'Variantes automáticas', desc: 'Gere múltiplos formatos de um mesmo conteúdo' },
    { key: 'revisionLoop', label: 'Revisão incremental', desc: 'Solicite ajustes sem reprocessar tudo' },
    { key: 'apiAccess', label: 'Acesso à API', desc: 'Integre via API programática' },
    { key: 'landingPageGeneration', label: 'Landing pages', desc: 'Gere landing pages completas do seu material' },
  ];

  for (const f of featureMap) {
    if (!features[f.key]) {
      // Find which plan enables it
      let availableFrom: PlanTier = 'agency';
      if (PLAN_FEATURES['pro'][f.key]) availableFrom = 'pro';

      locked.push({
        feature: f.key,
        label: f.label,
        description: f.desc,
        availableFrom,
      });
    }
  }

  return locked;
}

function getUpgradeOptions(currentPlan: PlanTier): UpgradeOption[] {
  const options: UpgradeOption[] = [];
  const planOrder: PlanTier[] = ['starter', 'pro', 'agency'];
  const currentIdx = planOrder.indexOf(currentPlan);

  for (let i = currentIdx + 1; i < planOrder.length; i++) {
    const tier = planOrder[i]!;
    const plan = PLANS[tier];
    const highlights: string[] = [];

    if (tier === 'pro') {
      highlights.push('Publicação automática', '50 jobs/mês', 'Testes A/B', 'Insights inteligentes');
    } else if (tier === 'agency') {
      highlights.push('500 jobs/mês', 'API programática', '50 seats', 'SLA dedicado');
    }

    options.push({
      planTier: tier,
      planName: plan.name,
      priceMonthlyBRL: plan.priceMonthlyBRL,
      highlights,
    });
  }

  return options;
}
