/**
 * Executive Co-Pilot / Operations Advisor — Domain Entities
 *
 * Consolida decisões, analytics, insights, alerts, memory e estado
 * operacional em orientações acionáveis para humanos.
 *
 * Conceitos:
 *   - Advisory          — recomendação individual com prioridade e rationale
 *   - AdvisoryBundle    — conjunto priorizado de advisories para um tenant
 *   - NextBestAction    — ação imediata mais valiosa que o usuário pode tomar
 *   - ExecutiveSummary  — visão executiva do estado do tenant
 *   - OperationalSummary— visão operacional detalhada
 *   - AdvisoryAudience  — público-alvo da recomendação
 *
 * Parte 95: Executive Co-Pilot / Operations Advisor
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Categoria do advisory. */
export enum AdvisoryCategory {
  PERFORMANCE_OPPORTUNITY  = 'performance_opportunity',
  PUBLICATION_RISK         = 'publication_risk',
  GOVERNANCE_ESCALATION    = 'governance_escalation',
  BILLING_WARNING          = 'billing_warning',
  CAMPAIGN_OPTIMIZATION    = 'campaign_optimization',
  RECOVERY_RECOMMENDATION  = 'recovery_recommendation',
  PLAN_UPGRADE             = 'plan_upgrade',
  OPERATOR_INTERVENTION    = 'operator_intervention',
  STRATEGIC_INSIGHT        = 'strategic_insight',
  QUALITY_ALERT            = 'quality_alert',
}

/** Urgência do advisory. */
export enum AdvisoryUrgency {
  CRITICAL  = 'critical',
  HIGH      = 'high',
  MEDIUM    = 'medium',
  LOW       = 'low',
  INFO      = 'info',
}

/** Público-alvo do advisory. */
export enum AdvisoryAudience {
  /** Tenant/usuário final (customer dashboard) */
  TENANT        = 'tenant',
  /** Administrador/operador interno */
  ADMIN_OPS     = 'admin_ops',
  /** Dono da conta / decisor */
  ACCOUNT_OWNER = 'account_owner',
  /** Operador de suporte/recovery */
  SUPPORT       = 'support',
}

/** Status do advisory. */
export enum AdvisoryStatus {
  ACTIVE      = 'active',
  ACKNOWLEDGED = 'acknowledged',
  ACTED_UPON  = 'acted_upon',
  DISMISSED   = 'dismissed',
  EXPIRED     = 'expired',
}

/** Fonte de dados que originou o advisory. */
export enum AdvisorySource {
  DECISION_ENGINE    = 'decision_engine',
  ANALYTICS          = 'analytics',
  INSIGHTS           = 'insights',
  ALERTS             = 'alerts',
  TENANT_MEMORY      = 'tenant_memory',
  CAMPAIGN_STATE     = 'campaign_state',
  SCHEDULE_STATE     = 'schedule_state',
  PUBLICATION_STATE  = 'publication_state',
  BILLING_STATE      = 'billing_state',
  GOVERNANCE_STATE   = 'governance_state',
  RECOVERY_STATE     = 'recovery_state',
  KNOWLEDGE_GRAPH    = 'knowledge_graph',
  SIMULATION         = 'simulation',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Rationale do advisory — por que esta recomendação? */
export interface AdvisoryRationale {
  summary: string;
  evidences: string[];
  sources: AdvisorySource[];
  confidence: number;
}

/** Advisory individual — uma recomendação acionável. */
export interface Advisory {
  id: string;
  tenantId: string | null;
  category: AdvisoryCategory;
  urgency: AdvisoryUrgency;
  audience: AdvisoryAudience;
  status: AdvisoryStatus;
  title: string;
  description: string;
  rationale: AdvisoryRationale;
  /** Ação sugerida (texto legível) */
  suggestedAction: string;
  /** Endpoint ou operação do sistema que resolve (quando aplicável) */
  actionEndpoint: string | null;
  /** Entity ID relacionada (campaign, job, etc.) */
  relatedEntityId: string | null;
  relatedEntityType: string | null;
  /** Priority score (0–100, maior = mais urgente) */
  priority: number;
  createdAt: string;
  expiresAt: string | null;
}

/** Next Best Action — a ação mais valiosa neste momento. */
export interface NextBestAction {
  id: string;
  title: string;
  description: string;
  category: AdvisoryCategory;
  urgency: AdvisoryUrgency;
  /** Estimativa de impacto se a ação for tomada */
  expectedImpact: string;
  /** Passos concretos */
  steps: string[];
  rationale: AdvisoryRationale;
  relatedAdvisoryIds: string[];
}

/** Bundle de advisories priorizado para um tenant. */
export interface AdvisoryBundle {
  tenantId: string | null;
  advisories: Advisory[];
  nextBestActions: NextBestAction[];
  totalActive: number;
  totalCritical: number;
  totalHigh: number;
  generatedAt: string;
}

/** Health indicator para o executive summary. */
export interface HealthIndicator {
  dimension: string;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  value: string;
  detail: string;
}

/** Executive Summary — visão de alto nível para decisores. */
export interface ExecutiveSummary {
  tenantId: string | null;
  /** Status geral do tenant */
  overallHealth: 'healthy' | 'warning' | 'critical';
  /** Frase resumo de uma linha */
  headline: string;
  /** Indicadores de saúde por dimensão */
  healthIndicators: HealthIndicator[];
  /** KPIs resumidos */
  kpis: Record<string, number | string>;
  /** Top 3 advisories mais urgentes */
  topAdvisories: Advisory[];
  /** Próxima melhor ação */
  nextBestAction: NextBestAction | null;
  /** Tendência geral */
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
  generatedAt: string;
}

/** Operational Summary — visão detalhada para operadores. */
export interface OperationalSummary {
  tenantId: string | null;
  /** Campaigns ativas e seu progresso */
  activeCampaigns: number;
  avgCampaignProgress: number;
  /** Publicações recentes */
  recentPublications: number;
  pendingPublications: number;
  /** Schedules ativos */
  activeSchedules: number;
  /** Decisões pendentes de escalação */
  pendingDecisions: number;
  /** Recovery: stuck states */
  stuckStates: number;
  /** Billing utilization */
  billingUtilization: number;
  /** Governance checkpoints pendentes */
  pendingCheckpoints: number;
  /** Advisories por urgência */
  advisoriesByUrgency: Record<string, number>;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Labels de categoria. */
export const ADVISORY_CATEGORY_LABELS: Record<AdvisoryCategory, string> = {
  [AdvisoryCategory.PERFORMANCE_OPPORTUNITY]: 'Performance Opportunity',
  [AdvisoryCategory.PUBLICATION_RISK]:        'Publication Risk',
  [AdvisoryCategory.GOVERNANCE_ESCALATION]:   'Governance Escalation',
  [AdvisoryCategory.BILLING_WARNING]:         'Billing Warning',
  [AdvisoryCategory.CAMPAIGN_OPTIMIZATION]:   'Campaign Optimization',
  [AdvisoryCategory.RECOVERY_RECOMMENDATION]: 'Recovery Recommendation',
  [AdvisoryCategory.PLAN_UPGRADE]:            'Plan Upgrade',
  [AdvisoryCategory.OPERATOR_INTERVENTION]:   'Operator Intervention',
  [AdvisoryCategory.STRATEGIC_INSIGHT]:       'Strategic Insight',
  [AdvisoryCategory.QUALITY_ALERT]:           'Quality Alert',
};

/** Labels de urgência. */
export const ADVISORY_URGENCY_LABELS: Record<AdvisoryUrgency, string> = {
  [AdvisoryUrgency.CRITICAL]: 'Critical',
  [AdvisoryUrgency.HIGH]:     'High',
  [AdvisoryUrgency.MEDIUM]:   'Medium',
  [AdvisoryUrgency.LOW]:      'Low',
  [AdvisoryUrgency.INFO]:     'Info',
};

/** Labels de audiência. */
export const ADVISORY_AUDIENCE_LABELS: Record<AdvisoryAudience, string> = {
  [AdvisoryAudience.TENANT]:        'Tenant / User',
  [AdvisoryAudience.ADMIN_OPS]:     'Admin / Ops',
  [AdvisoryAudience.ACCOUNT_OWNER]: 'Account Owner',
  [AdvisoryAudience.SUPPORT]:       'Support / Recovery',
};

/** Labels de status. */
export const ADVISORY_STATUS_LABELS: Record<AdvisoryStatus, string> = {
  [AdvisoryStatus.ACTIVE]:       'Active',
  [AdvisoryStatus.ACKNOWLEDGED]: 'Acknowledged',
  [AdvisoryStatus.ACTED_UPON]:   'Acted Upon',
  [AdvisoryStatus.DISMISSED]:    'Dismissed',
  [AdvisoryStatus.EXPIRED]:      'Expired',
};

/** Peso de urgência para cálculo de priority. */
export const URGENCY_WEIGHT: Record<AdvisoryUrgency, number> = {
  [AdvisoryUrgency.CRITICAL]: 100,
  [AdvisoryUrgency.HIGH]:     75,
  [AdvisoryUrgency.MEDIUM]:   50,
  [AdvisoryUrgency.LOW]:      25,
  [AdvisoryUrgency.INFO]:     10,
};

/** Max advisories retornados por bundle. */
export const MAX_ADVISORIES_PER_BUNDLE = 20;

/** Max next best actions. */
export const MAX_NEXT_BEST_ACTIONS = 5;
