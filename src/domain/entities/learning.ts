/**
 * Entity: LearningSignal / FeedbackAggregate / OptimizationRule
 *
 * Sistema de aprendizado contínuo que consolida feedback de múltiplas fontes
 * (scoring, experiments, reviews, usage) e gera regras de otimização.
 *
 * Fluxo:
 *   1. Sinais são coletados de scoring, experiments, reviews, usage
 *   2. Aggregator consolida sinais por tipo de output
 *   3. Padrões são identificados (melhores presets, durações, layouts)
 *   4. Regras de otimização são geradas (if X → prefer Y)
 *   5. Regras são aplicadas em Preset, Variant e Template Engines
 *
 * Persistência: bookagent_learning
 *
 * Parte 73: Learning Engine
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Fonte do sinal de aprendizado */
export enum SignalSource {
  SCORING = 'scoring',
  EXPERIMENT = 'experiment',
  REVIEW = 'review',
  USAGE = 'usage',
  PUBLISH = 'publish',
}

/** Tipo de sinal */
export enum SignalType {
  /** Score alto/baixo em dimensão específica */
  QUALITY_SCORE = 'quality_score',
  /** Resultado de experimento A/B */
  AB_RESULT = 'ab_result',
  /** Feedback positivo/negativo de review */
  REVIEW_FEEDBACK = 'review_feedback',
  /** Métrica de performance (views, engagement) */
  PERFORMANCE_METRIC = 'performance_metric',
  /** Preferência de uso (formato, preset, duração) */
  USAGE_PREFERENCE = 'usage_preference',
}

/** Categoria de otimização */
export enum OptimizationCategory {
  PRESET = 'preset',
  DURATION = 'duration',
  LAYOUT = 'layout',
  FORMAT = 'format',
  TONE = 'tone',
  SCENE_COUNT = 'scene_count',
  TEXT_DENSITY = 'text_density',
  MUSIC = 'music',
}

/** Status da regra */
export enum RuleStatus {
  /** Regra ativa — sendo aplicada */
  ACTIVE = 'active',
  /** Regra em período de teste */
  TESTING = 'testing',
  /** Regra desativada */
  DISABLED = 'disabled',
  /** Regra expirada (dados insuficientes ou antigos) */
  EXPIRED = 'expired',
}

/** Direção do ajuste */
export enum AdjustmentDirection {
  BOOST = 'boost',
  REDUCE = 'reduce',
  PREFER = 'prefer',
  AVOID = 'avoid',
}

// ---------------------------------------------------------------------------
// Learning Signal
// ---------------------------------------------------------------------------

/**
 * Sinal individual de aprendizado — evento atômico que alimenta o aggregator.
 */
export interface LearningSignal {
  /** ID único do sinal */
  id: string;

  /** Fonte do sinal */
  source: SignalSource;

  /** Tipo do sinal */
  type: SignalType;

  /** ID do job de origem */
  jobId: string;

  /** ID do tenant de origem (Parte 74: multi-tenant scoping) */
  tenantId?: string;

  /** Formato de output associado (reel, blog, etc.) */
  outputFormat?: string;

  /** Dimensão / atributo avaliado */
  dimension: string;

  /** Valor do sinal (score, métrica, etc.) */
  value: number;

  /** Valor de referência para comparação */
  referenceValue?: number;

  /** Contexto adicional (preset usado, duração, layout, etc.) */
  context: Record<string, unknown>;

  /** Peso do sinal (0-1, default 1) */
  weight: number;

  /** Timestamp */
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Feedback Aggregate
// ---------------------------------------------------------------------------

/**
 * Agregação de sinais por dimensão / contexto.
 * Identifica padrões estatísticos nos dados acumulados.
 */
export interface FeedbackAggregate {
  /** Chave de agregação (ex: "preset:luxury", "format:reel", "duration:15s") */
  key: string;

  /** Categoria de otimização */
  category: OptimizationCategory;

  /** Formato de output (se aplicável) */
  outputFormat?: string;

  /** Número de sinais agregados */
  sampleSize: number;

  /** Score médio */
  averageScore: number;

  /** Score mediano */
  medianScore: number;

  /** Desvio padrão */
  stdDeviation: number;

  /** Score mínimo */
  minScore: number;

  /** Score máximo */
  maxScore: number;

  /** Tendência: positiva, negativa, estável */
  trend: 'improving' | 'declining' | 'stable';

  /** Confiança na agregação (0-1, baseada em sample size) */
  confidence: number;

  /** Última atualização */
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Optimization Rule
// ---------------------------------------------------------------------------

/**
 * Condição para ativação de uma regra.
 */
export interface RuleCondition {
  /** Campo a avaliar (ex: "outputFormat", "tone", "channel") */
  field: string;

  /** Operador */
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'in' | 'contains';

  /** Valor esperado */
  value: string | number | string[];
}

/**
 * Ajuste a ser aplicado quando a regra é ativada.
 */
export interface RuleAdjustment {
  /** Categoria do ajuste */
  category: OptimizationCategory;

  /** Direção */
  direction: AdjustmentDirection;

  /** Alvo do ajuste (ex: "luxury", "15", "overlay") */
  target: string;

  /** Magnitude do ajuste (0-1, onde 1 = máximo) */
  magnitude: number;

  /** Descrição legível */
  description: string;
}

/**
 * Regra de otimização — if conditions → apply adjustments.
 * Gerada automaticamente pelo aggregator ou manualmente.
 */
export interface OptimizationRule {
  /** ID único da regra */
  id: string;

  /** ID do tenant (null = regra global) (Parte 74) */
  tenantId?: string;

  /** Nome legível */
  name: string;

  /** Categoria principal */
  category: OptimizationCategory;

  /** Condições para ativação (AND) */
  conditions: RuleCondition[];

  /** Ajustes a aplicar */
  adjustments: RuleAdjustment[];

  /** Status da regra */
  status: RuleStatus;

  /** Confiança (0-1, baseada nos dados que geraram a regra) */
  confidence: number;

  /** Número de vezes que a regra foi aplicada */
  appliedCount: number;

  /** Número de sinais que suportam esta regra */
  supportingSignals: number;

  /** Feedback positivo após aplicação */
  positiveOutcomes: number;

  /** Feedback negativo após aplicação */
  negativeOutcomes: number;

  /** Taxa de sucesso (positiveOutcomes / appliedCount) */
  successRate: number;

  /** Fonte dos dados que geraram a regra */
  source: SignalSource;

  /** Criado em */
  createdAt: Date;

  /** Última atualização */
  updatedAt: Date;

  /** Expira em (regras perdem validade sem novos dados) */
  expiresAt: Date;
}

// ---------------------------------------------------------------------------
// Learning Profile
// ---------------------------------------------------------------------------

/**
 * Perfil de aprendizado consolidado — snapshot do que o sistema aprendeu.
 * Usado como input para decisões do pipeline.
 */
export interface LearningProfile {
  /** Número total de sinais processados */
  totalSignals: number;

  /** Agregações por categoria */
  aggregates: FeedbackAggregate[];

  /** Regras ativas */
  activeRules: OptimizationRule[];

  /** Recomendações derivadas (simplificado para consumo pelo pipeline) */
  recommendations: LearningRecommendation[];

  /** Última atualização */
  updatedAt: Date;
}

/**
 * Recomendação simplificada para consumo direto pelo pipeline.
 */
export interface LearningRecommendation {
  /** Categoria */
  category: OptimizationCategory;

  /** Formato de output (se específico) */
  outputFormat?: string;

  /** Recomendação (ex: "prefer preset luxury for reels") */
  recommendation: string;

  /** Valor recomendado (ex: "luxury", "15", "overlay") */
  value: string;

  /** Confiança (0-1) */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Mínimo de sinais para gerar uma agregação confiável */
export const MIN_SIGNALS_FOR_AGGREGATE = 5;

/** Mínimo de confiança para ativar uma regra */
export const MIN_CONFIDENCE_FOR_RULE = 0.6;

/** Dias até uma regra expirar sem novos dados */
export const RULE_EXPIRY_DAYS = 30;

/** Score mínimo para considerar sinal como positivo */
export const POSITIVE_SIGNAL_THRESHOLD = 75;

/** Score máximo para considerar sinal como negativo */
export const NEGATIVE_SIGNAL_THRESHOLD = 40;
