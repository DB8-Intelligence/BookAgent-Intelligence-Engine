/**
 * Entity: Experiment / ExperimentVariant / ExperimentResult / VariantPerformance
 *
 * Sistema de A/B Testing para comparar variantes de conteúdo.
 * Agrupa variantes em grupos (A/B/C), rastreia performance
 * e seleciona vencedores baseado em métricas ou scoring interno.
 *
 * Persistência: bookagent_experiments
 *
 * Parte 72: A/B Testing Engine
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Status do experimento */
export enum ExperimentStatus {
  DRAFT = 'draft',
  RUNNING = 'running',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

/** Método de seleção do vencedor */
export enum WinnerSelectionMethod {
  /** Baseado em métricas reais (views, clicks, engagement) */
  PERFORMANCE = 'performance',
  /** Baseado no scoring interno (Parte 70) */
  INTERNAL_SCORE = 'internal_score',
  /** Seleção manual pelo usuário */
  MANUAL = 'manual',
}

/** Grupo do experimento (A/B/C...) */
export type ExperimentGroup = 'A' | 'B' | 'C' | 'D';

// ---------------------------------------------------------------------------
// Performance Tracking
// ---------------------------------------------------------------------------

/**
 * Métricas de performance de uma variante no experimento.
 */
export interface VariantPerformance {
  /** Views / impressões */
  views: number;

  /** Clicks / taps */
  clicks: number;

  /** Engagement (likes + comments + shares) */
  engagement: number;

  /** Taxa de conversão (clicks/views) */
  clickThroughRate: number;

  /** Taxa de engajamento (engagement/views) */
  engagementRate: number;

  /** Score interno (Parte 70) — fallback quando sem dados reais */
  internalScore: number;

  /** Score composto (ponderado) para comparação */
  compositeScore: number;

  /** Última atualização das métricas */
  lastUpdatedAt: Date;
}

/** Performance default (sem dados) */
export const EMPTY_PERFORMANCE: VariantPerformance = {
  views: 0,
  clicks: 0,
  engagement: 0,
  clickThroughRate: 0,
  engagementRate: 0,
  internalScore: 0,
  compositeScore: 0,
  lastUpdatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Experiment Variant
// ---------------------------------------------------------------------------

/**
 * Uma variante dentro de um experimento — liga um OutputVariant/artifactId
 * a um grupo e rastreia sua performance.
 */
export interface ExperimentVariant {
  /** ID da variante spec (referência à VariantSpec) */
  variantId: string;

  /** ID do artifact gerado (se disponível) */
  artifactId?: string;

  /** Grupo no experimento (A, B, C, D) */
  group: ExperimentGroup;

  /** Nome legível da variante */
  name: string;

  /** Canal de distribuição */
  channel?: string;

  /** Performance acumulada */
  performance: VariantPerformance;

  /** Se esta variante foi declarada vencedora */
  isWinner: boolean;
}

// ---------------------------------------------------------------------------
// Experiment Result
// ---------------------------------------------------------------------------

/**
 * Resultado final de um experimento.
 */
export interface ExperimentResult {
  /** ID da variante vencedora */
  winnerVariantId: string;

  /** Grupo vencedor */
  winnerGroup: ExperimentGroup;

  /** Método usado para determinar o vencedor */
  method: WinnerSelectionMethod;

  /** Margem de vitória (diferença percentual no compositeScore) */
  marginPercent: number;

  /** Confiança estatística (0-1, placeholder para testes reais) */
  confidence: number;

  /** Resumo legível */
  summary: string;

  /** Data da conclusão */
  concludedAt: Date;
}

// ---------------------------------------------------------------------------
// Experiment
// ---------------------------------------------------------------------------

/**
 * Experiment — agrupa variantes para comparação A/B.
 * Persistido em bookagent_experiments.
 */
export interface Experiment {
  /** ID único do experimento */
  id: string;

  /** ID do job associado */
  jobId: string;

  /** Nome do experimento */
  name: string;

  /** Status atual */
  status: ExperimentStatus;

  /** Variantes participando do experimento */
  variants: ExperimentVariant[];

  /** IDs das variantes (para query rápida) */
  variantIds: string[];

  /** Resultado (preenchido quando status=completed) */
  result?: ExperimentResult;

  /** ID da variante vencedora (atalho) */
  winnerVariantId?: string;

  /** Configuração */
  config: ExperimentConfig;

  /** Criado em */
  createdAt: Date;

  /** Última atualização */
  updatedAt: Date;

  /** Concluído em */
  completedAt?: Date;
}

/**
 * Configuração do experimento.
 */
export interface ExperimentConfig {
  /** Duração mínima antes de poder concluir (horas) */
  minDurationHours: number;

  /** Views mínimas por variante antes de concluir */
  minViewsPerVariant: number;

  /** Se deve auto-concluir quando atingir métricas mínimas */
  autoComplete: boolean;

  /** Pesos para o composite score */
  weights: ExperimentWeights;
}

/**
 * Pesos para cálculo do composite score.
 */
export interface ExperimentWeights {
  /** Peso de views (default 0.1) */
  views: number;
  /** Peso de click-through rate (default 0.3) */
  ctr: number;
  /** Peso de engagement rate (default 0.3) */
  engagement: number;
  /** Peso do score interno (default 0.3) */
  internalScore: number;
}

/** Config default para experimentos */
export const DEFAULT_EXPERIMENT_CONFIG: ExperimentConfig = {
  minDurationHours: 24,
  minViewsPerVariant: 100,
  autoComplete: false,
  weights: {
    views: 0.1,
    ctr: 0.3,
    engagement: 0.3,
    internalScore: 0.3,
  },
};

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

/**
 * Payload para criar um novo experimento.
 */
export interface CreateExperimentPayload {
  jobId: string;
  name?: string;
  variantIds: string[];
  config?: Partial<Omit<ExperimentConfig, 'weights'>> & {
    weights?: Partial<ExperimentWeights>;
  };
}

/**
 * Payload para registrar evento de tracking.
 */
export interface TrackEventPayload {
  experimentId: string;
  variantId: string;
  eventType: 'view' | 'click' | 'engagement';
  count?: number;
}
