/**
 * Continuous Improvement Loop / Meta-Optimization — Domain Entities
 *
 * Camada que observa a performance do próprio sistema e propõe
 * ajustes incrementais para melhoria contínua.
 *
 * Conceitos:
 *   - ImprovementCycle      — ciclo completo de análise → insight → ação → tracking
 *   - SystemPerformanceMetric — métrica de desempenho do sistema
 *   - MetaInsight           — insight sobre o próprio comportamento do sistema
 *   - OptimizationAction    — ação de ajuste proposta ou aplicada
 *   - SystemHealthIndicator — indicador de saúde operacional
 *
 * Persistência:
 *   - bookagent_improvement_cycles
 *
 * Parte 99: Continuous Improvement Loop / Meta-Optimization
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Dimensão de performance analisada. */
export enum PerformanceDimension {
  CAMPAIGN_SUCCESS_RATE  = 'campaign_success_rate',
  PUBLICATION_SUCCESS_RATE = 'publication_success_rate',
  DECISION_ACCURACY      = 'decision_accuracy',
  RECOVERY_EFFECTIVENESS = 'recovery_effectiveness',
  COST_EFFICIENCY        = 'cost_efficiency',
  EXECUTION_LATENCY      = 'execution_latency',
  QUALITY_SCORE_AVG      = 'quality_score_avg',
  RETRY_RATE             = 'retry_rate',
  ESCALATION_RATE        = 'escalation_rate',
  GOVERNANCE_PASS_RATE   = 'governance_pass_rate',
}

/** Tipo de ação de otimização. */
export enum MetaActionType {
  ADJUST_THRESHOLD      = 'adjust_threshold',
  ADJUST_STRATEGY       = 'adjust_strategy',
  ADJUST_CADENCE        = 'adjust_cadence',
  ADJUST_PRIORITY       = 'adjust_priority',
  ADJUST_RETRY_POLICY   = 'adjust_retry_policy',
  ADJUST_COST_TARGET    = 'adjust_cost_target',
  SUGGEST_CONFIG_CHANGE = 'suggest_config_change',
  DEPRECATE_RULE        = 'deprecate_rule',
  REINFORCE_RULE        = 'reinforce_rule',
}

/** Status da ação de otimização. */
export enum OptimizationActionStatus {
  PROPOSED  = 'proposed',
  APPROVED  = 'approved',
  APPLIED   = 'applied',
  REJECTED  = 'rejected',
  REVERTED  = 'reverted',
}

/** Status do ciclo de melhoria. */
export enum CycleStatus {
  RUNNING    = 'running',
  COMPLETED  = 'completed',
  FAILED     = 'failed',
}

/** Severidade do meta-insight. */
export enum MetaInsightSeverity {
  INFO       = 'info',
  SUGGESTION = 'suggestion',
  WARNING    = 'warning',
  CRITICAL   = 'critical',
}

/** Health status de um indicador. */
export enum HealthStatus {
  HEALTHY  = 'healthy',
  WARNING  = 'warning',
  CRITICAL = 'critical',
  UNKNOWN  = 'unknown',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Métrica de performance do sistema. */
export interface SystemPerformanceMetric {
  dimension: PerformanceDimension;
  /** Valor atual (0–100 ou unidade específica) */
  currentValue: number;
  /** Valor anterior (ciclo anterior) */
  previousValue: number | null;
  /** Tendência: positiva, negativa, estável */
  trend: 'improving' | 'declining' | 'stable';
  /** Threshold ideal */
  targetValue: number;
  /** Gap entre current e target */
  gap: number;
  sampleSize: number;
  measuredAt: string;
}

/** Insight sobre o próprio comportamento do sistema. */
export interface MetaInsight {
  id: string;
  dimension: PerformanceDimension;
  severity: MetaInsightSeverity;
  title: string;
  description: string;
  /** Evidências */
  evidence: string[];
  /** Ação sugerida */
  suggestedAction: MetaActionType | null;
  /** Impacto esperado da ação */
  expectedImpact: string;
}

/** Ação de otimização proposta ou aplicada. */
export interface OptimizationAction {
  id: string;
  type: MetaActionType;
  status: OptimizationActionStatus;
  /** O que será/foi ajustado */
  target: string;
  /** Valor anterior */
  fromValue: string;
  /** Valor proposto */
  toValue: string;
  /** Razão do ajuste */
  rationale: string;
  /** Impacto esperado */
  expectedImpact: string;
  /** Impacto observado (após aplicação) */
  observedImpact: string | null;
  createdAt: string;
  appliedAt: string | null;
}

/** Indicador de saúde operacional do sistema. */
export interface SystemHealthIndicator {
  dimension: string;
  status: HealthStatus;
  value: string;
  detail: string;
  trend: 'improving' | 'declining' | 'stable';
}

/** Ciclo completo de melhoria. */
export interface ImprovementCycle {
  id: string;
  tenantId: string | null;
  status: CycleStatus;
  /** Métricas analisadas */
  metrics: SystemPerformanceMetric[];
  /** Insights gerados */
  insights: MetaInsight[];
  /** Ações propostas */
  actions: OptimizationAction[];
  /** Indicadores de saúde */
  healthIndicators: SystemHealthIndicator[];
  /** Resumo do ciclo */
  summary: string;
  /** Métricas agregadas */
  overallScore: number;
  previousScore: number | null;
  scoreDelta: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PERFORMANCE_DIMENSION_LABELS: Record<PerformanceDimension, string> = {
  [PerformanceDimension.CAMPAIGN_SUCCESS_RATE]:   'Campaign Success Rate',
  [PerformanceDimension.PUBLICATION_SUCCESS_RATE]: 'Publication Success Rate',
  [PerformanceDimension.DECISION_ACCURACY]:       'Decision Accuracy',
  [PerformanceDimension.RECOVERY_EFFECTIVENESS]:  'Recovery Effectiveness',
  [PerformanceDimension.COST_EFFICIENCY]:         'Cost Efficiency',
  [PerformanceDimension.EXECUTION_LATENCY]:       'Execution Latency',
  [PerformanceDimension.QUALITY_SCORE_AVG]:       'Quality Score Average',
  [PerformanceDimension.RETRY_RATE]:              'Retry Rate',
  [PerformanceDimension.ESCALATION_RATE]:         'Escalation Rate',
  [PerformanceDimension.GOVERNANCE_PASS_RATE]:    'Governance Pass Rate',
};

export const META_ACTION_TYPE_LABELS: Record<MetaActionType, string> = {
  [MetaActionType.ADJUST_THRESHOLD]:      'Adjust Threshold',
  [MetaActionType.ADJUST_STRATEGY]:       'Adjust Strategy',
  [MetaActionType.ADJUST_CADENCE]:        'Adjust Cadence',
  [MetaActionType.ADJUST_PRIORITY]:       'Adjust Priority',
  [MetaActionType.ADJUST_RETRY_POLICY]:   'Adjust Retry Policy',
  [MetaActionType.ADJUST_COST_TARGET]:    'Adjust Cost Target',
  [MetaActionType.SUGGEST_CONFIG_CHANGE]: 'Suggest Config Change',
  [MetaActionType.DEPRECATE_RULE]:        'Deprecate Rule',
  [MetaActionType.REINFORCE_RULE]:        'Reinforce Rule',
};

export const CYCLE_STATUS_LABELS: Record<CycleStatus, string> = {
  [CycleStatus.RUNNING]:   'Running',
  [CycleStatus.COMPLETED]: 'Completed',
  [CycleStatus.FAILED]:    'Failed',
};

/** Targets ideais por dimensão (0–100). */
export const DEFAULT_TARGETS: Record<PerformanceDimension, number> = {
  [PerformanceDimension.CAMPAIGN_SUCCESS_RATE]:   80,
  [PerformanceDimension.PUBLICATION_SUCCESS_RATE]: 90,
  [PerformanceDimension.DECISION_ACCURACY]:       75,
  [PerformanceDimension.RECOVERY_EFFECTIVENESS]:  70,
  [PerformanceDimension.COST_EFFICIENCY]:         60,
  [PerformanceDimension.EXECUTION_LATENCY]:       70,
  [PerformanceDimension.QUALITY_SCORE_AVG]:       65,
  [PerformanceDimension.RETRY_RATE]:              80,
  [PerformanceDimension.ESCALATION_RATE]:         70,
  [PerformanceDimension.GOVERNANCE_PASS_RATE]:    85,
};
