/**
 * Entity: Goal-Driven Campaign Optimization
 *
 * Conceitos:
 *
 *   CAMPAIGN GOAL:
 *     Meta concreta e mensurável vinculada a uma campanha.
 *     Ex: "Gerar 50 leads em 14 dias", "Alcançar 10k views",
 *     "Publicar 5 reels com score > 75".
 *
 *   GOAL METRIC:
 *     Métrica observável que quantifica progresso em direção à meta.
 *     Ex: leads gerados, views, publicações com sucesso, engagement rate.
 *
 *   OPTIMIZATION SIGNAL:
 *     Dado coletado durante a execução da campanha que informa
 *     o otimizador se a campanha está progredindo ou estagnada.
 *
 *   OPTIMIZATION RECOMMENDATION:
 *     Sugestão tática gerada pelo otimizador para corrigir rumo
 *     da campanha. Ex: "Aumente frequência de reels", "Mude
 *     horário de publicação", "Troque template".
 *
 *   CAMPAIGN HEALTH:
 *     Avaliação de saúde da campanha em relação às suas metas.
 *     On-track, at-risk, off-track, overperforming.
 *
 *   OPTIMIZATION CYCLE:
 *     Ciclo de avaliação — coleta signals, avalia progresso,
 *     gera recomendações, aplica ajustes.
 *
 * Relações:
 *   Campaign → CampaignGoal → GoalMetrics → OptimizationSignals
 *   OptimizationCycle → Recommendations → Schedule/Campaign adjustments
 *
 * Persistência: bookagent_campaign_optimizations
 *
 * Parte 89: Goal-Driven Campaign Optimization
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Tipo de métrica de goal */
export enum GoalMetricType {
  /** Contagem absoluta (ex: leads, views, publicações) */
  COUNT = 'count',
  /** Taxa/percentual (ex: engagement rate, success rate) */
  RATE = 'rate',
  /** Score (ex: quality score médio) */
  SCORE = 'score',
  /** Alcance (reach, impressions) */
  REACH = 'reach',
}

/** Status de saúde da campanha em relação ao goal */
export enum CampaignHealth {
  /** Acima do esperado */
  OVERPERFORMING = 'overperforming',
  /** No caminho certo */
  ON_TRACK = 'on_track',
  /** Em risco de não atingir */
  AT_RISK = 'at_risk',
  /** Fora do caminho */
  OFF_TRACK = 'off_track',
  /** Sem dados suficientes */
  INSUFFICIENT_DATA = 'insufficient_data',
}

/** Tipo de recomendação de otimização */
export enum OptimizationActionType {
  /** Aumentar frequência */
  INCREASE_FREQUENCY = 'increase_frequency',
  /** Reduzir frequência */
  DECREASE_FREQUENCY = 'decrease_frequency',
  /** Mudar horário de publicação */
  CHANGE_TIMING = 'change_timing',
  /** Trocar formato */
  CHANGE_FORMAT = 'change_format',
  /** Trocar template */
  CHANGE_TEMPLATE = 'change_template',
  /** Trocar canal */
  CHANGE_CHANNEL = 'change_channel',
  /** Ajustar target/CTA */
  ADJUST_CTA = 'adjust_cta',
  /** Estender campanha */
  EXTEND_DURATION = 'extend_duration',
  /** Encurtar campanha */
  SHORTEN_DURATION = 'shorten_duration',
  /** Adicionar itens */
  ADD_ITEMS = 'add_items',
  /** Remover itens low-performing */
  REMOVE_ITEMS = 'remove_items',
  /** Manter rumo (está ok) */
  MAINTAIN_COURSE = 'maintain_course',
}

/** Impacto estimado da recomendação */
export enum OptimizationImpact {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

// ---------------------------------------------------------------------------
// Campaign Goal
// ---------------------------------------------------------------------------

/**
 * Meta concreta vinculada a uma campanha.
 */
export interface CampaignGoal {
  /** ID */
  id: string;
  /** ID da campanha */
  campaignId: string;
  /** Nome do goal */
  name: string;
  /** Descrição */
  description: string;
  /** Tipo de métrica */
  metricType: GoalMetricType;
  /** Métrica chave (ex: "leads", "views", "publications", "engagement_rate") */
  metricKey: string;
  /** Valor alvo */
  targetValue: number;
  /** Valor atual */
  currentValue: number;
  /** Prazo */
  deadline: string;
  /** Progresso (0-100) */
  progressPercent: number;
  /** Saúde */
  health: CampaignHealth;
}

// ---------------------------------------------------------------------------
// Goal Metric Snapshot
// ---------------------------------------------------------------------------

/**
 * Snapshot de uma métrica em um ponto no tempo.
 */
export interface GoalMetricSnapshot {
  /** Métrica key */
  metricKey: string;
  /** Valor neste snapshot */
  value: number;
  /** Valor alvo */
  target: number;
  /** Progresso percentual */
  progressPercent: number;
  /** Tendência (positiva, negativa, estável) */
  trend: 'improving' | 'declining' | 'stable';
  /** Projeção: vai atingir a meta no prazo? */
  projectedToHit: boolean;
  /** Timestamp */
  measuredAt: string;
}

// ---------------------------------------------------------------------------
// Optimization Signal
// ---------------------------------------------------------------------------

/**
 * Signal coletado durante a execução que informa otimização.
 */
export interface OptimizationSignal {
  /** Tipo do signal */
  type: 'publication_success' | 'publication_failure' | 'quality_score' | 'engagement' | 'timing' | 'format_performance';
  /** Valor */
  value: number;
  /** Referência (ex: schedule item ID, publication ID) */
  referenceId: string;
  /** Contexto (formato, canal, horário, etc.) */
  context: Record<string, string>;
  /** Timestamp */
  collectedAt: string;
}

// ---------------------------------------------------------------------------
// Optimization Recommendation
// ---------------------------------------------------------------------------

/**
 * Recomendação tática para otimizar a campanha.
 */
export interface OptimizationRecommendation {
  /** ID */
  id: string;
  /** Ação */
  action: OptimizationActionType;
  /** Título */
  title: string;
  /** Descrição */
  description: string;
  /** Impacto estimado */
  impact: OptimizationImpact;
  /** Confiança (0-100) */
  confidence: number;
  /** Dados que suportam esta recomendação */
  supportingData: Array<{ metric: string; value: string }>;
  /** Aplicada? */
  applied: boolean;
}

// ---------------------------------------------------------------------------
// Optimization Cycle
// ---------------------------------------------------------------------------

/**
 * Ciclo de otimização — uma avaliação completa.
 */
export interface OptimizationCycle {
  /** ID */
  id: string;
  /** ID da campanha */
  campaignId: string;
  /** ID do tenant */
  tenantId: string;
  /** Goals avaliados */
  goals: CampaignGoal[];
  /** Snapshots de métricas */
  metricSnapshots: GoalMetricSnapshot[];
  /** Signals coletados */
  signals: OptimizationSignal[];
  /** Saúde geral da campanha */
  overallHealth: CampaignHealth;
  /** Recomendações */
  recommendations: OptimizationRecommendation[];
  /** Resumo executivo */
  summary: string;
  /** Timestamp */
  evaluatedAt: string;
  /** Próxima avaliação sugerida */
  nextEvaluationAt: string;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const CAMPAIGN_HEALTH_LABELS: Record<CampaignHealth, string> = {
  [CampaignHealth.OVERPERFORMING]: 'Acima do esperado',
  [CampaignHealth.ON_TRACK]: 'No caminho',
  [CampaignHealth.AT_RISK]: 'Em risco',
  [CampaignHealth.OFF_TRACK]: 'Fora do caminho',
  [CampaignHealth.INSUFFICIENT_DATA]: 'Dados insuficientes',
};

export const HEALTH_COLORS: Record<CampaignHealth, string> = {
  [CampaignHealth.OVERPERFORMING]: '#22c55e',
  [CampaignHealth.ON_TRACK]: '#3b82f6',
  [CampaignHealth.AT_RISK]: '#f59e0b',
  [CampaignHealth.OFF_TRACK]: '#ef4444',
  [CampaignHealth.INSUFFICIENT_DATA]: '#9ca3af',
};

export const OPTIMIZATION_ACTION_LABELS: Record<OptimizationActionType, string> = {
  [OptimizationActionType.INCREASE_FREQUENCY]: 'Aumentar frequência',
  [OptimizationActionType.DECREASE_FREQUENCY]: 'Reduzir frequência',
  [OptimizationActionType.CHANGE_TIMING]: 'Mudar horário',
  [OptimizationActionType.CHANGE_FORMAT]: 'Mudar formato',
  [OptimizationActionType.CHANGE_TEMPLATE]: 'Mudar template',
  [OptimizationActionType.CHANGE_CHANNEL]: 'Mudar canal',
  [OptimizationActionType.ADJUST_CTA]: 'Ajustar CTA',
  [OptimizationActionType.EXTEND_DURATION]: 'Estender duração',
  [OptimizationActionType.SHORTEN_DURATION]: 'Encurtar duração',
  [OptimizationActionType.ADD_ITEMS]: 'Adicionar itens',
  [OptimizationActionType.REMOVE_ITEMS]: 'Remover itens',
  [OptimizationActionType.MAINTAIN_COURSE]: 'Manter rumo',
};
