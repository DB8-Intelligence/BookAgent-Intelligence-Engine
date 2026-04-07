/**
 * Entity: Review / ReviewComment / ReviewDecision
 *
 * Modelo unificado de revisão e comentários sobre outputs.
 * Suporta comentários por job, artifact, ou variante,
 * com origem do dashboard ou WhatsApp.
 *
 * Persistência: bookagent_reviews
 *
 * Parte 68: Review/Comment Engine
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Decisão de revisão */
export enum ReviewDecision {
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ADJUSTMENT_REQUESTED = 'adjustment_requested',
  COMMENT = 'comment',
}

/** Canal de origem do review */
export enum ReviewChannel {
  DASHBOARD = 'dashboard',
  WHATSAPP = 'whatsapp',
  API = 'api',
}

/** Tipo de target (o que está sendo revisado) */
export enum ReviewTargetType {
  JOB = 'job',
  ARTIFACT = 'artifact',
  VARIANT = 'variant',
  CAPTION = 'caption',
  THUMBNAIL = 'thumbnail',
  VIDEO = 'video',
  AUDIO = 'audio',
}

/** Status do review item */
export enum ReviewStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
  SUPERSEDED = 'superseded',
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/**
 * Um item de review — registro persistido em bookagent_reviews.
 * Pode representar uma aprovação, reprovação, pedido de ajuste ou comentário.
 */
export interface ReviewItem {
  /** ID único do review */
  id: string;

  /** ID do job associado */
  jobId: string;

  /** ID do artifact específico (se aplicável) */
  artifactId?: string;

  /** ID da variante específica (se aplicável) */
  variantId?: string;

  /** Tipo do target sendo revisado */
  targetType: ReviewTargetType;

  /** ID do usuário que fez o review */
  userId: string;

  /** Canal de origem */
  channel: ReviewChannel;

  /** Decisão tomada */
  decision: ReviewDecision;

  /** Comentário textual */
  comment: string;

  /** Status do review (open, resolved, superseded) */
  status: ReviewStatus;

  /** Rodada de aprovação (alinha com approval_round do dashboard) */
  approvalRound: number;

  /** ID do review pai (para threading de comentários) */
  parentReviewId?: string;

  /** ID da revisão gerada a partir deste review (Parte 69 link) */
  revisionId?: string;

  /** Metadados adicionais (ex: coordenadas de anotação, timestamp do vídeo) */
  metadata?: Record<string, unknown>;

  /** Criado em */
  createdAt: Date;

  /** Última atualização */
  updatedAt: Date;

  /** Resolvido em */
  resolvedAt?: Date;
}

/**
 * Comentário de review — forma simplificada para listagem.
 */
export interface ReviewComment {
  id: string;
  jobId: string;
  userId: string;
  targetType: ReviewTargetType;
  artifactId?: string;
  variantId?: string;
  comment: string;
  channel: ReviewChannel;
  createdAt: Date;
}

/**
 * Payload para criar um novo review.
 */
export interface CreateReviewPayload {
  jobId: string;
  userId: string;
  targetType: ReviewTargetType;
  decision: ReviewDecision;
  comment: string;
  channel: ReviewChannel;
  artifactId?: string;
  variantId?: string;
  approvalRound?: number;
  parentReviewId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Filtros para buscar reviews.
 */
export interface ReviewFilter {
  jobId: string;
  artifactId?: string;
  variantId?: string;
  targetType?: ReviewTargetType;
  decision?: ReviewDecision;
  status?: ReviewStatus;
  channel?: ReviewChannel;
}

/**
 * Resumo de reviews de um job.
 */
export interface ReviewSummary {
  jobId: string;
  totalReviews: number;
  openCount: number;
  resolvedCount: number;
  approvedCount: number;
  rejectedCount: number;
  adjustmentRequestedCount: number;
  commentCount: number;
  latestDecision?: ReviewDecision;
  latestComment?: string;
  latestAt?: Date;
}
