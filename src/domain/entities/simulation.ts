/**
 * Simulation & What-If Engine — Domain Entities
 *
 * Modela cenários hipotéticos para comparação de impacto antes
 * da execução real de estratégias e campanhas.
 *
 * Conceitos:
 *   - SimulationScenario  — cenário completo (baseline ou alternativo)
 *   - ScenarioVariable    — eixo de variação (canal, formato, cadência, etc.)
 *   - WhatIfChange        — alteração proposta num cenário alternativo
 *   - ImpactEstimate      — estimativa de impacto de uma mudança
 *   - ScenarioComparison  — resultado da comparação baseline vs alternativo
 *   - SimulationResult    — resultado consolidado de uma simulação
 *   - WhatIfRecommendation — recomendação derivada da simulação
 *
 * Persistência:
 *   - bookagent_simulations
 *
 * Parte 93: Simulation & What-If Engine
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Status da simulação. */
export enum SimulationStatus {
  DRAFT     = 'draft',
  RUNNING   = 'running',
  COMPLETED = 'completed',
  FAILED    = 'failed',
}

/** Eixos de variação suportados para simulação. */
export enum SimulationAxis {
  /** Canal de publicação (instagram, youtube, etc.) */
  CHANNEL           = 'channel',
  /** Mix de formatos/outputs (video, blog, reel, etc.) */
  OUTPUT_MIX        = 'output_mix',
  /** Preset/template utilizado */
  PRESET_TEMPLATE   = 'preset_template',
  /** Duração da campanha */
  CAMPAIGN_DURATION = 'campaign_duration',
  /** Quantidade de variantes por output */
  VARIANT_COUNT     = 'variant_count',
  /** Cadência de publicação */
  CADENCE           = 'cadence',
  /** Priorização de goal/objetivo */
  GOAL_PRIORITY     = 'goal_priority',
  /** Auto-publish ligado/desligado */
  AUTO_PUBLISH      = 'auto_publish',
  /** Nível de autonomia/governança */
  AUTONOMY_LEVEL    = 'autonomy_level',
}

/** Nível de confiança da estimativa. */
export enum ConfidenceLevel {
  HIGH    = 'high',
  MEDIUM  = 'medium',
  LOW     = 'low',
  /** Sem dados suficientes para estimar */
  UNKNOWN = 'unknown',
}

/** Direção do impacto estimado. */
export enum ImpactDirection {
  POSITIVE = 'positive',
  NEGATIVE = 'negative',
  NEUTRAL  = 'neutral',
  MIXED    = 'mixed',
}

/** Dimensão afetada pelo impacto. */
export enum ImpactDimension {
  REACH         = 'reach',
  ENGAGEMENT    = 'engagement',
  CONVERSION    = 'conversion',
  COST          = 'cost',
  QUALITY       = 'quality',
  SPEED         = 'speed',
  CONSISTENCY   = 'consistency',
  RISK          = 'risk',
}

/** Categoria de recomendação. */
export enum RecommendationCategory {
  STRATEGY    = 'strategy',
  CAMPAIGN    = 'campaign',
  SCHEDULING  = 'scheduling',
  CHANNEL     = 'channel',
  CONTENT     = 'content',
  GOVERNANCE  = 'governance',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Variável de um cenário — um eixo de configuração com valor específico. */
export interface ScenarioVariable {
  axis: SimulationAxis;
  /** Nome legível da variável */
  label: string;
  /** Valor atual / baseline */
  currentValue: string | number | boolean;
  /** Valor proposto no cenário alternativo (null = inalterado) */
  proposedValue: string | number | boolean | null;
}

/** Mudança proposta num cenário alternativo. */
export interface WhatIfChange {
  axis: SimulationAxis;
  fromValue: string | number | boolean;
  toValue: string | number | boolean;
  rationale: string;
}

/** Estimativa de impacto de uma mudança ou cenário. */
export interface ImpactEstimate {
  dimension: ImpactDimension;
  direction: ImpactDirection;
  /** Magnitude estimada em percentual (-100 a +100) */
  magnitudePercent: number;
  confidence: ConfidenceLevel;
  /** Evidências que suportam a estimativa */
  evidence: string[];
  /** Explicação do raciocínio */
  rationale: string;
}

/** Cenário de simulação (baseline ou alternativo). */
export interface SimulationScenario {
  id: string;
  name: string;
  description: string;
  /** Se true, este é o cenário baseline (estado atual) */
  isBaseline: boolean;
  variables: ScenarioVariable[];
  changes: WhatIfChange[];
  impacts: ImpactEstimate[];
  /** Score geral estimado (0–100) */
  overallScore: number;
  /** Trade-offs identificados */
  tradeoffs: string[];
}

/** Comparação entre baseline e cenário alternativo. */
export interface ScenarioComparison {
  baselineId: string;
  alternativeId: string;
  /** Ganhos prováveis da alternativa */
  gains: ImpactEstimate[];
  /** Perdas prováveis da alternativa */
  losses: ImpactEstimate[];
  /** Score delta (alternativo - baseline) */
  scoreDelta: number;
  /** Resumo em texto */
  summary: string;
  /** Veredicto: vale a pena trocar? */
  verdict: 'recommended' | 'neutral' | 'not_recommended';
}

/** Recomendação derivada da simulação. */
export interface WhatIfRecommendation {
  id: string;
  category: RecommendationCategory;
  title: string;
  description: string;
  expectedImpact: ImpactEstimate;
  change: WhatIfChange;
  priority: number;
}

/** Resultado consolidado de uma simulação. */
export interface SimulationResult {
  id: string;
  tenantId: string | null;
  status: SimulationStatus;
  baseline: SimulationScenario;
  alternatives: SimulationScenario[];
  comparisons: ScenarioComparison[];
  recommendations: WhatIfRecommendation[];
  /** Resumo geral explicável */
  summary: string;
  /** Limitações e caveats da simulação */
  caveats: string[];
  createdAt: string;
  completedAt: string | null;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Labels dos eixos de simulação. */
export const SIMULATION_AXIS_LABELS: Record<SimulationAxis, string> = {
  [SimulationAxis.CHANNEL]:           'Publication Channel',
  [SimulationAxis.OUTPUT_MIX]:        'Output Format Mix',
  [SimulationAxis.PRESET_TEMPLATE]:   'Preset / Template',
  [SimulationAxis.CAMPAIGN_DURATION]: 'Campaign Duration',
  [SimulationAxis.VARIANT_COUNT]:     'Variant Count',
  [SimulationAxis.CADENCE]:           'Publication Cadence',
  [SimulationAxis.GOAL_PRIORITY]:     'Goal Priority',
  [SimulationAxis.AUTO_PUBLISH]:      'Auto-Publish',
  [SimulationAxis.AUTONOMY_LEVEL]:    'Autonomy Level',
};

/** Labels de nível de confiança. */
export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  [ConfidenceLevel.HIGH]:    'High',
  [ConfidenceLevel.MEDIUM]:  'Medium',
  [ConfidenceLevel.LOW]:     'Low',
  [ConfidenceLevel.UNKNOWN]: 'Unknown',
};

/** Labels de direção de impacto. */
export const IMPACT_DIRECTION_LABELS: Record<ImpactDirection, string> = {
  [ImpactDirection.POSITIVE]: 'Positive',
  [ImpactDirection.NEGATIVE]: 'Negative',
  [ImpactDirection.NEUTRAL]:  'Neutral',
  [ImpactDirection.MIXED]:    'Mixed',
};

/** Labels de dimensão de impacto. */
export const IMPACT_DIMENSION_LABELS: Record<ImpactDimension, string> = {
  [ImpactDimension.REACH]:       'Reach',
  [ImpactDimension.ENGAGEMENT]:  'Engagement',
  [ImpactDimension.CONVERSION]:  'Conversion',
  [ImpactDimension.COST]:        'Cost',
  [ImpactDimension.QUALITY]:     'Quality',
  [ImpactDimension.SPEED]:       'Speed',
  [ImpactDimension.CONSISTENCY]: 'Consistency',
  [ImpactDimension.RISK]:        'Risk',
};

/** Labels de categoria de recomendação. */
export const RECOMMENDATION_CATEGORY_LABELS: Record<RecommendationCategory, string> = {
  [RecommendationCategory.STRATEGY]:   'Strategy',
  [RecommendationCategory.CAMPAIGN]:   'Campaign',
  [RecommendationCategory.SCHEDULING]: 'Scheduling',
  [RecommendationCategory.CHANNEL]:    'Channel',
  [RecommendationCategory.CONTENT]:    'Content',
  [RecommendationCategory.GOVERNANCE]: 'Governance',
};

/** Número mínimo de data points para confiança HIGH. */
export const MIN_DATA_POINTS_HIGH_CONFIDENCE = 20;

/** Número mínimo de data points para confiança MEDIUM. */
export const MIN_DATA_POINTS_MEDIUM_CONFIDENCE = 5;

/** Caveats padrão da V1. */
export const DEFAULT_CAVEATS: string[] = [
  'Estimates are based on historical tenant data and system heuristics — not guarantees.',
  'External factors (market conditions, audience behavior) are not modeled.',
  'Results improve as the system accumulates more data about this tenant.',
  'Cross-entity inferences rely on knowledge graph which may be incomplete.',
];
