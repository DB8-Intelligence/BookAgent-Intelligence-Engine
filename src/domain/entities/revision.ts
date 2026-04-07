/**
 * Entity: Revision / RevisionRequest / RevisionResult
 *
 * Modelo para reprocessamento parcial baseado em review.
 * Permite re-rodar somente o subsistema necessário
 * (caption, thumbnail, variant, video, audio) sem duplicar o job inteiro.
 *
 * Persistência: bookagent_revisions
 *
 * Parte 69: Revision Loop Engine
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Tipo de target para revisão */
export enum RevisionTargetType {
  CAPTION = 'caption',
  THUMBNAIL = 'thumbnail',
  VARIANT = 'variant',
  VIDEO = 'video',
  AUDIO = 'audio',
  TEXT = 'text',
}

/** Status da revisão */
export enum RevisionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/** Estratégia de reprocessamento */
export enum RevisionStrategy {
  /** Apenas texto/caption — text generation */
  TEXT_ONLY = 'text_only',
  /** Apenas thumbnail — thumbnail engine */
  THUMBNAIL_ONLY = 'thumbnail_only',
  /** Apenas variante específica — variant + render */
  VARIANT_ONLY = 'variant_only',
  /** Apenas vídeo — render pipeline */
  VIDEO_RENDER = 'video_render',
  /** Apenas áudio — music/narration */
  AUDIO_ONLY = 'audio_only',
  /** Completo — rerodar do ponto afetado em diante */
  FULL_REPROCESS = 'full_reprocess',
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/**
 * Alvo específico da revisão — identifica exatamente o que precisa mudar.
 */
export interface RevisionTarget {
  /** Tipo do target */
  type: RevisionTargetType;

  /** ID do artifact afetado */
  artifactId?: string;

  /** ID da variante afetada */
  variantId?: string;

  /** Campo específico a alterar (ex: "headline", "caption", "cta_text") */
  field?: string;

  /** Valor atual (para referência / diff) */
  currentValue?: string;
}

/**
 * Request de revisão — gerado a partir de um review/comment.
 */
export interface RevisionRequest {
  /** ID único da revisão */
  id: string;

  /** ID do job de origem */
  jobId: string;

  /** ID do review que originou esta revisão (Parte 68 link) */
  reviewId: string;

  /** Alvo da revisão */
  target: RevisionTarget;

  /** Mudança solicitada pelo reviewer */
  requestedChange: string;

  /** Estratégia de reprocessamento inferida */
  strategy: RevisionStrategy;

  /** Status atual */
  status: RevisionStatus;

  /** Versão do artifact (incrementa a cada revisão) */
  version: number;

  /** ID do usuário que solicitou */
  userId: string;

  /** Resultado da revisão (preenchido após processamento) */
  result?: RevisionResult;

  /** Criado em */
  createdAt: Date;

  /** Última atualização */
  updatedAt: Date;

  /** Concluído em */
  completedAt?: Date;
}

/**
 * Resultado do reprocessamento.
 */
export interface RevisionResult {
  /** Se o reprocessamento foi bem-sucedido */
  success: boolean;

  /** Novo artifact ID gerado (se aplicável) */
  newArtifactId?: string;

  /** Novo valor gerado (para campos textuais) */
  newValue?: string;

  /** Caminho do novo arquivo (se gerou arquivo) */
  newFilePath?: string;

  /** Subsistemas executados */
  stepsExecuted: string[];

  /** Duração do reprocessamento (ms) */
  durationMs: number;

  /** Erro (se falhou) */
  error?: string;
}

/**
 * Payload para criar uma nova revisão via API.
 */
export interface CreateRevisionPayload {
  jobId: string;
  reviewId: string;
  userId: string;
  targetType: RevisionTargetType;
  targetId?: string;
  requestedChange: string;
  field?: string;
  artifactId?: string;
  variantId?: string;
}

/**
 * Mapeamento target → strategy (usado pelo engine para inferir).
 */
export const TARGET_STRATEGY_MAP: Record<RevisionTargetType, RevisionStrategy> = {
  [RevisionTargetType.CAPTION]: RevisionStrategy.TEXT_ONLY,
  [RevisionTargetType.TEXT]: RevisionStrategy.TEXT_ONLY,
  [RevisionTargetType.THUMBNAIL]: RevisionStrategy.THUMBNAIL_ONLY,
  [RevisionTargetType.VARIANT]: RevisionStrategy.VARIANT_ONLY,
  [RevisionTargetType.VIDEO]: RevisionStrategy.VIDEO_RENDER,
  [RevisionTargetType.AUDIO]: RevisionStrategy.AUDIO_ONLY,
};
