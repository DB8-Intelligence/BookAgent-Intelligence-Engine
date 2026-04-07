/**
 * Entity: ContentScore / ScoreBreakdown / QualityDimension
 *
 * Avaliação automática de qualidade dos outputs antes da entrega.
 * Score de 0-100 com breakdown por dimensão (texto, visual, narrativa, técnica).
 *
 * Thresholds:
 *   <50  → baixo (needs_revision)
 *   50-75 → médio (approved_for_delivery com ressalvas)
 *   >75  → alto (approved_for_delivery)
 *
 * Parte 70: Content Quality & Scoring Engine
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Dimensão de qualidade avaliada */
export enum QualityDimension {
  TEXT = 'text',
  VISUAL = 'visual',
  NARRATIVE = 'narrative',
  TECHNICAL = 'technical',
}

/** Nível de qualidade baseado no score */
export enum QualityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/** Decisão de qualidade para o output */
export enum QualityDecision {
  APPROVED_FOR_DELIVERY = 'approved_for_delivery',
  NEEDS_REVISION = 'needs_revision',
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** Resultado de avaliação de uma dimensão específica */
export interface DimensionScore {
  /** Dimensão avaliada */
  dimension: QualityDimension;

  /** Score desta dimensão (0-100) */
  score: number;

  /** Peso desta dimensão no score final (0-1) */
  weight: number;

  /** Detalhes dos critérios avaliados */
  criteria: CriterionResult[];

  /** Observações / warnings */
  notes: string[];
}

/** Resultado de um critério individual */
export interface CriterionResult {
  /** Nome do critério (ex: "repetição", "clareza", "presença_hook") */
  name: string;

  /** Score do critério (0-100) */
  score: number;

  /** Descrição legível do resultado */
  description: string;
}

/**
 * Score breakdown — detalha a avaliação de cada dimensão.
 */
export interface ScoreBreakdown {
  /** Scores por dimensão */
  dimensions: DimensionScore[];

  /** Critérios com score mais baixo (top problemas) */
  weakPoints: CriterionResult[];

  /** Critérios com score mais alto (pontos fortes) */
  strongPoints: CriterionResult[];
}

/**
 * ContentScore — avaliação completa de um output.
 * Persistido e usado para decisão de entrega.
 */
export interface ContentScore {
  /** ID do output/plano avaliado */
  targetId: string;

  /** Tipo do target (media_plan, blog_plan, narrative, variant) */
  targetType: string;

  /** Score final consolidado (0-100) */
  score: number;

  /** Nível de qualidade */
  level: QualityLevel;

  /** Decisão de entrega */
  decision: QualityDecision;

  /** Breakdown detalhado */
  breakdown: ScoreBreakdown;

  /** Timestamp da avaliação */
  evaluatedAt: Date;
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Threshold para qualidade baixa */
export const QUALITY_THRESHOLD_LOW = 50;

/** Threshold para qualidade alta */
export const QUALITY_THRESHOLD_HIGH = 75;

/** Pesos default por dimensão */
export const DEFAULT_DIMENSION_WEIGHTS: Record<QualityDimension, number> = {
  [QualityDimension.TEXT]: 0.30,
  [QualityDimension.VISUAL]: 0.25,
  [QualityDimension.NARRATIVE]: 0.25,
  [QualityDimension.TECHNICAL]: 0.20,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Determina o QualityLevel a partir do score */
export function scoreToLevel(score: number): QualityLevel {
  if (score < QUALITY_THRESHOLD_LOW) return QualityLevel.LOW;
  if (score > QUALITY_THRESHOLD_HIGH) return QualityLevel.HIGH;
  return QualityLevel.MEDIUM;
}

/** Determina a decisão a partir do score */
export function scoreToDecision(score: number): QualityDecision {
  return score < QUALITY_THRESHOLD_LOW
    ? QualityDecision.NEEDS_REVISION
    : QualityDecision.APPROVED_FOR_DELIVERY;
}
