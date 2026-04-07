/**
 * Review Service — Review/Comment Engine
 *
 * Serviço unificado para criação, consulta e gestão de reviews.
 * Suporta comentários por job, artifact ou variante,
 * com origem do dashboard ou WhatsApp.
 *
 * Fluxo:
 *   1. Recebe CreateReviewPayload (da API ou WhatsApp)
 *   2. Valida e normaliza dados
 *   3. Persiste em bookagent_reviews
 *   4. Retorna ReviewItem com ID gerado
 *
 * Persistência: bookagent_reviews
 *
 * Parte 68: Review/Comment Engine
 */

import { v4 as uuid } from 'uuid';

import type {
  ReviewItem,
  CreateReviewPayload,
  ReviewFilter,
  ReviewSummary,
} from '../../domain/entities/review.js';
import {
  ReviewDecision,
  ReviewStatus,
  ReviewTargetType,
} from '../../domain/entities/review.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Table name
// ---------------------------------------------------------------------------

const TABLE = 'bookagent_reviews';

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Cria um novo review item e persiste no Supabase.
 */
export async function createReview(
  payload: CreateReviewPayload,
  supabase: SupabaseClient | null,
): Promise<ReviewItem> {
  const now = new Date();

  const review: ReviewItem = {
    id: uuid(),
    jobId: payload.jobId,
    userId: payload.userId,
    targetType: payload.targetType,
    decision: payload.decision,
    comment: payload.comment,
    channel: payload.channel,
    status: ReviewStatus.OPEN,
    approvalRound: payload.approvalRound ?? 1,
    artifactId: payload.artifactId,
    variantId: payload.variantId,
    parentReviewId: payload.parentReviewId,
    metadata: payload.metadata,
    createdAt: now,
    updatedAt: now,
  };

  if (supabase) {
    await persistReview(supabase, review);
  }

  logger.info(
    `[ReviewService] Created review ${review.id}: ` +
    `job=${review.jobId} target=${review.targetType} decision=${review.decision} ` +
    `channel=${review.channel}`,
  );

  return review;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Lista reviews de um job com filtros opcionais.
 */
export async function listReviews(
  filter: ReviewFilter,
  supabase: SupabaseClient | null,
): Promise<ReviewItem[]> {
  if (!supabase) return [];

  const filters: Array<{ column: string; operator: 'eq'; value: string }> = [
    { column: 'job_id', operator: 'eq', value: filter.jobId },
  ];

  if (filter.artifactId) {
    filters.push({ column: 'artifact_id', operator: 'eq', value: filter.artifactId });
  }
  if (filter.variantId) {
    filters.push({ column: 'variant_id', operator: 'eq', value: filter.variantId });
  }
  if (filter.targetType) {
    filters.push({ column: 'target_type', operator: 'eq', value: filter.targetType });
  }
  if (filter.decision) {
    filters.push({ column: 'decision', operator: 'eq', value: filter.decision });
  }
  if (filter.status) {
    filters.push({ column: 'status', operator: 'eq', value: filter.status });
  }
  if (filter.channel) {
    filters.push({ column: 'channel', operator: 'eq', value: filter.channel });
  }

  try {
    const rows = await supabase.select<ReviewRow>(TABLE, {
      filters,
      orderBy: 'created_at',
      orderDesc: true,
    });

    return rows.map(rowToReviewItem);
  } catch (err) {
    logger.warn(`[ReviewService] Failed to list reviews for job ${filter.jobId}: ${err}`);
    return [];
  }
}

/**
 * Busca um review por ID.
 */
export async function getReviewById(
  reviewId: string,
  supabase: SupabaseClient | null,
): Promise<ReviewItem | null> {
  if (!supabase) return null;

  try {
    const rows = await supabase.select<ReviewRow>(TABLE, {
      filters: [{ column: 'id', operator: 'eq', value: reviewId }],
      limit: 1,
    });

    return rows.length > 0 ? rowToReviewItem(rows[0]) : null;
  } catch (err) {
    logger.warn(`[ReviewService] Failed to get review ${reviewId}: ${err}`);
    return null;
  }
}

/**
 * Gera um resumo de reviews para um job.
 */
export async function getReviewSummary(
  jobId: string,
  supabase: SupabaseClient | null,
): Promise<ReviewSummary> {
  const reviews = await listReviews({ jobId }, supabase);

  const summary: ReviewSummary = {
    jobId,
    totalReviews: reviews.length,
    openCount: reviews.filter((r) => r.status === ReviewStatus.OPEN).length,
    resolvedCount: reviews.filter((r) => r.status === ReviewStatus.RESOLVED).length,
    approvedCount: reviews.filter((r) => r.decision === ReviewDecision.APPROVED).length,
    rejectedCount: reviews.filter((r) => r.decision === ReviewDecision.REJECTED).length,
    adjustmentRequestedCount: reviews.filter(
      (r) => r.decision === ReviewDecision.ADJUSTMENT_REQUESTED,
    ).length,
    commentCount: reviews.filter((r) => r.decision === ReviewDecision.COMMENT).length,
  };

  if (reviews.length > 0) {
    const latest = reviews[0]; // already sorted desc
    summary.latestDecision = latest.decision;
    summary.latestComment = latest.comment;
    summary.latestAt = latest.createdAt;
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Resolve um review (marca como resolvido).
 */
export async function resolveReview(
  reviewId: string,
  revisionId: string | undefined,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  const now = new Date();

  try {
    await supabase.update(TABLE, { column: 'id', operator: 'eq', value: reviewId }, {
      status: ReviewStatus.RESOLVED,
      revision_id: revisionId ?? null,
      resolved_at: now.toISOString(),
      updated_at: now.toISOString(),
    });

    logger.info(`[ReviewService] Resolved review ${reviewId} → revision=${revisionId ?? 'N/A'}`);
  } catch (err) {
    logger.warn(`[ReviewService] Failed to resolve review ${reviewId}: ${err}`);
  }
}

/**
 * Marca reviews antigos como superseded (quando um novo review sobrepõe).
 */
export async function supersedeReviews(
  jobId: string,
  targetType: ReviewTargetType,
  artifactId: string | undefined,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  // Fetch open reviews for this target and update each
  const openReviews = await listReviews(
    { jobId, targetType, status: ReviewStatus.OPEN, artifactId },
    supabase,
  );

  for (const review of openReviews) {
    try {
      await supabase.update(TABLE, { column: 'id', operator: 'eq', value: review.id }, {
        status: ReviewStatus.SUPERSEDED,
        updated_at: new Date().toISOString(),
      });
    } catch {
      // best-effort
    }
  }

  if (openReviews.length > 0) {
    logger.info(
      `[ReviewService] Superseded ${openReviews.length} reviews for ` +
      `job=${jobId} target=${targetType}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

interface ReviewRow {
  id: string;
  job_id: string;
  artifact_id: string | null;
  variant_id: string | null;
  target_type: string;
  user_id: string;
  channel: string;
  decision: string;
  comment: string;
  status: string;
  approval_round: number;
  parent_review_id: string | null;
  revision_id: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

async function persistReview(supabase: SupabaseClient, review: ReviewItem): Promise<void> {
  try {
    await supabase.insert(TABLE, {
      id: review.id,
      job_id: review.jobId,
      artifact_id: review.artifactId ?? null,
      variant_id: review.variantId ?? null,
      target_type: review.targetType,
      user_id: review.userId,
      channel: review.channel,
      decision: review.decision,
      comment: review.comment,
      status: review.status,
      approval_round: review.approvalRound,
      parent_review_id: review.parentReviewId ?? null,
      revision_id: review.revisionId ?? null,
      metadata: review.metadata ? JSON.stringify(review.metadata) : null,
      created_at: review.createdAt.toISOString(),
      updated_at: review.updatedAt.toISOString(),
      resolved_at: review.resolvedAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.warn(`[ReviewService] Failed to persist review ${review.id}: ${err}`);
  }
}

function rowToReviewItem(row: ReviewRow): ReviewItem {
  return {
    id: row.id,
    jobId: row.job_id,
    artifactId: row.artifact_id ?? undefined,
    variantId: row.variant_id ?? undefined,
    targetType: row.target_type as ReviewTargetType,
    userId: row.user_id,
    channel: row.channel as ReviewItem['channel'],
    decision: row.decision as ReviewDecision,
    comment: row.comment,
    status: row.status as ReviewStatus,
    approvalRound: row.approval_round,
    parentReviewId: row.parent_review_id ?? undefined,
    revisionId: row.revision_id ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
  };
}
