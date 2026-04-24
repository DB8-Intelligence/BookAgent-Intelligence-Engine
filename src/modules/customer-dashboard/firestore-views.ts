/**
 * Firestore Views — dashboard reads a partir do Firestore
 *
 * Substitui getOverview / getJobList / getGallery / getJobDetail do
 * dashboard-service.ts legado (que lia de Supabase) nas rotas
 * /api/v1/dashboard/*. Usa google-persistence.ts como fonte de verdade
 * pras 3 coleções migradas (profiles, jobs, artifacts).
 *
 * Outras views (getUsageView, getBillingView, getInsightsView,
 * getAnalytics etc.) continuam em Supabase — ainda não migradas.
 */

import type {
  CustomerDashboardOverview,
  CustomerJobListItem,
  CustomerJobDetail,
  CustomerArtifactView,
  CustomerAlert,
} from '../../domain/entities/customer-dashboard.js';
import {
  CustomerJobStatus,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_BADGE,
} from '../../domain/entities/customer-dashboard.js';
import type { TenantContext } from '../../domain/entities/tenant.js';
import { PLAN_FEATURES } from '../../domain/entities/tenant.js';
import {
  getProfile,
  getTenant,
  ensureProfile,
  listJobsByTenant,
  listArtifactsByTenant,
  listArtifactsByJob,
  getJob as getJobFromFirestore,
  type JobDoc,
  type ArtifactDoc,
  type Profile,
  type Tenant,
} from '../../persistence/google-persistence.js';
import { materializePeriodReset, planLimitsFor } from '../billing/firestore-billing.js';
import type { GalleryItem, GalleryFilters } from './dashboard-service.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jobStatusToCustomer(s: JobDoc['status']): CustomerJobStatus {
  switch (s) {
    case 'pending':
      return CustomerJobStatus.QUEUED;
    case 'processing':
      return CustomerJobStatus.PROCESSING;
    case 'completed':
      // Pipeline completo → aguardando revisão do cliente (fluxo padrão)
      return CustomerJobStatus.AWAITING_REVIEW;
    case 'failed':
      return CustomerJobStatus.FAILED;
    default:
      return CustomerJobStatus.PROCESSING;
  }
}

function jobDocToListItem(job: JobDoc, artifactCount: number): CustomerJobListItem {
  const status = jobStatusToCustomer(job.status);
  return {
    jobId: job.jobId,
    status,
    statusLabel: CUSTOMER_STATUS_LABELS[status],
    statusBadge: CUSTOMER_STATUS_BADGE[status],
    inputType: job.inputType,
    inputFileUrl: job.inputFileUrl,
    artifactsCount: artifactCount,
    publicationsCount: 0,           // publicações ainda são Supabase — será 0 até migrar
    hasPendingReview: false,
    qualityScore: null,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  };
}

function artifactDocToView(a: ArtifactDoc): CustomerArtifactView {
  return {
    id: a.artifactId,
    jobId: a.jobId,
    type: a.artifactType,
    format: a.exportFormat ?? '',
    title: a.title,
    sizeBytes: a.sizeBytes,
    downloadUrl: a.publicUrl ?? a.filePath,
    previewUrl: a.publicUrl,
    status: a.status,
    createdAt: a.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function getOverviewFromFirestore(
  tenantCtx: TenantContext,
): Promise<CustomerDashboardOverview> {
  const uid = tenantCtx.userId;
  const tid = tenantCtx.tenantId;

  // Se o período virou, grava os contadores zerados antes de ler o tenant
  // (best-effort — não bloqueia render se falhar)
  await materializePeriodReset(tid).catch(() => {});

  // Profile + Tenant + recent jobs em paralelo
  const [profile, tenant, recentJobsRaw] = await Promise.all([
    getProfile(uid),
    getTenant(tid),
    listJobsByTenant(tid, { limit: 5 }),
  ]);

  // Fallbacks defensivos — dev sem Firebase ou provisioning incompleto
  const safeProfile: Profile = profile ?? await fallbackProfile(uid, tid);
  const safeTenant: Tenant = tenant ?? fallbackTenant(uid, tid);

  // Contagem de artifacts por job (1 read por job do recent)
  const artifactCounts: Record<string, number> = {};
  await Promise.all(
    recentJobsRaw.map(async (job) => {
      try {
        const arts = await listArtifactsByJob(job.jobId);
        artifactCounts[job.jobId] = arts.length;
      } catch {
        artifactCounts[job.jobId] = 0;
      }
    }),
  );

  // Stats agregados (1 query extra por status se precisar — aqui contamos
  // localmente pelos recentJobs; pra contagem total usaríamos count aggregate
  // do Firestore, mas vale o skip no MVP)
  const completedThisMonth = recentJobsRaw.filter(
    (j) => j.status === 'completed' &&
      j.createdAt.startsWith(new Date().toISOString().slice(0, 7)),
  ).length;

  const totalArtifacts = Object.values(artifactCounts).reduce((a, b) => a + b, 0);

  const credits = safeTenant.credits;
  const alerts: CustomerAlert[] = [];
  if (credits.jobsUsed >= credits.jobsLimit) {
    alerts.push({
      type: 'warning',
      title: 'Créditos de job esgotados',
      message: `${credits.jobsUsed}/${credits.jobsLimit} usados este mês. Faça upgrade para continuar.`,
      actionLabel: 'Fazer upgrade',
    });
  }

  const jobsPercent = credits.jobsLimit > 0
    ? Math.round((credits.jobsUsed / credits.jobsLimit) * 100)
    : 0;
  const rendersPercent = credits.rendersLimit > 0
    ? Math.round((credits.rendersUsed / credits.rendersLimit) * 100)
    : 0;

  return {
    tenantName: safeTenant.name ?? safeProfile.name ?? safeProfile.email ?? tid,
    planTier: safeTenant.planTier,
    subscriptionStatus: 'active',
    stats: {
      jobsThisMonth: completedThisMonth,
      jobsTotal: recentJobsRaw.length,
      artifactsGenerated: totalArtifacts,
      publicationsSucceeded: 0,
      pendingReviews: 0,
      activeRevisions: 0,
    },
    usage: {
      jobsUsed: credits.jobsUsed,
      jobsLimit: credits.jobsLimit,
      jobsPercent,
      rendersUsed: credits.rendersUsed,
      rendersLimit: credits.rendersLimit,
      rendersPercent,
    },
    alerts,
    lockedFeatures: getLockedFeaturesForPlan(safeTenant.planTier),
    recentJobs: recentJobsRaw.map((j) => jobDocToListItem(j, artifactCounts[j.jobId] ?? 0)),
    generatedAt: new Date().toISOString(),
  };
}

async function fallbackProfile(uid: string, tenantId: string): Promise<Profile> {
  // Edge case: middleware pulou ensureProfile (DEV_BYPASS). Stub in-memory.
  const now = new Date();
  return {
    uid,
    email: '',
    name: null,
    activeTenantId: tenantId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function fallbackTenant(uid: string, tenantId: string): Tenant {
  const limits = planLimitsFor('starter');
  const now = new Date();
  return {
    tenantId,
    ownerUid: uid,
    name: 'Meu Workspace',
    planTier: 'starter',
    credits: {
      jobsUsed: 0,
      jobsLimit: limits.jobsLimit,
      rendersUsed: 0,
      rendersLimit: limits.rendersLimit,
      periodStart: now.toISOString(),
      periodEnd: new Date(now.getTime() + 30 * 86400_000).toISOString(),
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function getLockedFeaturesForPlan(
  planTier: 'starter' | 'pro' | 'agency',
): CustomerDashboardOverview['lockedFeatures'] {
  const features = PLAN_FEATURES[planTier];
  const locked: CustomerDashboardOverview['lockedFeatures'] = [];

  if (!features.autoPublish) {
    locked.push({
      feature: 'autoPublish',
      label: 'Publicação automática',
      description: 'Publicar direto no Instagram e Facebook',
      availableFrom: 'pro',
    });
  }
  if (!features.apiAccess) {
    locked.push({
      feature: 'apiAccess',
      label: 'API programática',
      description: 'Integrar o BookReel no seu CRM ou sistema interno',
      availableFrom: 'agency',
    });
  }
  return locked;
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export async function getJobListFromFirestore(
  tenantCtx: TenantContext,
  limit: number = 20,
): Promise<CustomerJobListItem[]> {
  const jobs = await listJobsByTenant(tenantCtx.tenantId, { limit });
  const counts: Record<string, number> = {};
  await Promise.all(
    jobs.map(async (j) => {
      try {
        const arts = await listArtifactsByJob(j.jobId);
        counts[j.jobId] = arts.length;
      } catch {
        counts[j.jobId] = 0;
      }
    }),
  );
  return jobs.map((j) => jobDocToListItem(j, counts[j.jobId] ?? 0));
}

export async function getJobDetailFromFirestore(
  tenantCtx: TenantContext,
  jobId: string,
): Promise<CustomerJobDetail | null> {
  const job = await getJobFromFirestore(jobId);
  if (!job || job.tenantId !== tenantCtx.tenantId) {
    logger.debug(`[FirestoreViews] jobDetail not-found or foreign: job=${jobId} tenant=${tenantCtx.tenantId}`);
    return null;
  }

  const artifacts = await listArtifactsByJob(jobId);
  const status = jobStatusToCustomer(job.status);

  return {
    jobId: job.jobId,
    status,
    statusLabel: CUSTOMER_STATUS_LABELS[status],
    statusBadge: CUSTOMER_STATUS_BADGE[status],
    inputType: job.inputType,
    pipeline: {
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      durationMs: job.completedAt
        ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
        : null,
      currentStage: job.currentStage,
    },
    artifacts: artifacts.map(artifactDocToView),
    reviews: [],
    publications: [],
    qualityScore: null,
    qualityLevel: null,
    approval: { status: null, round: 1, latestComment: null, latestDecisionAt: null },
    createdAt: job.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

export async function getGalleryFromFirestore(
  tenantCtx: TenantContext,
  filters: GalleryFilters = {},
): Promise<GalleryItem[]> {
  const artifacts = await listArtifactsByTenant(tenantCtx.tenantId, {
    type: filters.type,
    onlyWithDownload: filters.onlyWithDownload,
    limit: Math.min(filters.limit ?? 50, 200),
  });

  // Gallery expõe só publicUrl (GCS) — filePath é path local do Cloud Run
  // que seria 404 no browser. Se upload falhou, preferimos downloadUrl=null
  // e o frontend renderiza um placeholder "Processando…" em vez de link quebrado.
  return artifacts.map<GalleryItem>((a) => ({
    id: a.artifactId,
    jobId: a.jobId,
    type: a.artifactType,
    format: a.exportFormat ?? '',
    title: a.title,
    sizeBytes: a.sizeBytes,
    downloadUrl: a.publicUrl,
    previewUrl: a.publicUrl,
    status: a.status,
    createdAt: a.createdAt,
    mimeType: a.mimeType,
  }));
}

// ---------------------------------------------------------------------------
// Auto-ensure profile — conveniência pro controller chamar na primeira
// visita mesmo se o auth middleware foi bypassado
// ---------------------------------------------------------------------------

export { ensureProfile };
