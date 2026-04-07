/**
 * Entity: Customer Insight / Recommendation
 *
 * Transforma analytics, learning, scoring e usage em insights acionáveis.
 *
 * Categorias:
 *   - CONTENT:     formatos, presets, qualidade
 *   - PUBLISHING:  canais, taxas, timing
 *   - USAGE:       cota, eficiência, limites
 *   - PERFORMANCE: velocidade, falhas, tendências
 *   - PLAN:        upgrade, features, billing
 *
 * Priorização:
 *   - INFO:        informativo — dados interessantes
 *   - OPPORTUNITY: oportunidade — melhoria possível
 *   - RISK:        risco — algo precisa de atenção
 *   - URGENT:      ação urgente — impacto iminente
 *
 * Parte 82: Customer Insights & Recommendation
 */

import type { PlanTier } from '../../plans/plan-config.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Categoria do insight */
export enum InsightCategory {
  CONTENT = 'content',
  PUBLISHING = 'publishing',
  USAGE = 'usage',
  PERFORMANCE = 'performance',
  PLAN = 'plan',
}

/** Severidade / prioridade do insight */
export enum InsightSeverity {
  /** Dados interessantes, sem ação necessária */
  INFO = 'info',
  /** Melhoria possível — vale a pena considerar */
  OPPORTUNITY = 'opportunity',
  /** Algo precisa de atenção — pode causar problemas */
  RISK = 'risk',
  /** Ação urgente — impacto iminente */
  URGENT = 'urgent',
}

/** Tipo específico do insight */
export enum InsightType {
  // Content
  BEST_FORMAT = 'best_format',
  RECOMMENDED_PRESET = 'recommended_preset',
  IDEAL_DURATION = 'ideal_duration',
  QUALITY_TREND = 'quality_trend',
  HIGH_REJECTION_RATE = 'high_rejection_rate',

  // Publishing
  BEST_CHANNEL = 'best_channel',
  WORST_CHANNEL = 'worst_channel',
  PUBLISH_FAILURE_SPIKE = 'publish_failure_spike',
  AUTO_PUBLISH_SUGGESTION = 'auto_publish_suggestion',

  // Usage
  QUOTA_APPROACHING = 'quota_approaching',
  INEFFICIENT_USAGE = 'inefficient_usage',
  UNUSED_FEATURE = 'unused_feature',

  // Performance
  JOB_SLOWDOWN = 'job_slowdown',
  FAILURE_RATE_HIGH = 'failure_rate_high',
  IMPROVEMENT_DETECTED = 'improvement_detected',

  // Plan
  UPGRADE_RECOMMENDED = 'upgrade_recommended',
  PLAN_UNDERUTILIZED = 'plan_underutilized',
  TRIAL_EXPIRING = 'trial_expiring',
  BILLING_ISSUE = 'billing_issue',
}

// ---------------------------------------------------------------------------
// Recommendation Action
// ---------------------------------------------------------------------------

/**
 * Ação sugerida ao cliente.
 */
export interface RecommendationAction {
  /** Label do botão/link */
  label: string;
  /** Tipo de ação */
  actionType: 'navigate' | 'api_call' | 'external_link' | 'dismiss';
  /** URL ou endpoint */
  target?: string;
  /** Parâmetros (para api_call) */
  params?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Customer Insight
// ---------------------------------------------------------------------------

/**
 * Insight individual gerado para o cliente.
 */
export interface CustomerInsight {
  /** ID único */
  id: string;
  /** Categoria */
  category: InsightCategory;
  /** Tipo específico */
  type: InsightType;
  /** Severidade */
  severity: InsightSeverity;
  /** Título curto */
  title: string;
  /** Mensagem explicativa */
  message: string;
  /** Dados que suportam o insight */
  evidence: InsightEvidence;
  /** Ação recomendada */
  action?: RecommendationAction;
  /** Tenant */
  tenantId: string;
  /** Timestamp */
  generatedAt: Date;
  /** Validade (após este período, regenerar) */
  expiresAt: Date;
}

/**
 * Dados que suportam / explicam o insight.
 */
export interface InsightEvidence {
  /** Métrica principal */
  metric: string;
  /** Valor atual */
  currentValue: number | string;
  /** Valor de referência / comparação */
  referenceValue?: number | string;
  /** Label da comparação */
  referenceLabel?: string;
  /** Período analisado */
  period?: string;
  /** Sample size */
  sampleSize?: number;
  /** Confiança (0-1) */
  confidence?: number;
}

// ---------------------------------------------------------------------------
// Recommendation (structured suggestion)
// ---------------------------------------------------------------------------

/**
 * Recomendação estruturada derivada de insights.
 */
export interface Recommendation {
  /** ID */
  id: string;
  /** Título */
  title: string;
  /** Descrição detalhada */
  description: string;
  /** Categoria */
  category: InsightCategory;
  /** Severidade */
  severity: InsightSeverity;
  /** Impacto estimado */
  estimatedImpact: string;
  /** Ações possíveis */
  actions: RecommendationAction[];
  /** Insight(s) que geraram esta recomendação */
  sourceInsightIds: string[];
  /** Confiança (0-1) */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Tenant Insight Snapshot
// ---------------------------------------------------------------------------

/**
 * Snapshot completo de insights de um tenant.
 */
export interface TenantInsightSnapshot {
  tenantId: string;
  planTier: PlanTier;
  /** Todos os insights ativos */
  insights: CustomerInsight[];
  /** Recomendações consolidadas */
  recommendations: Recommendation[];
  /** Contadores por severidade */
  counts: {
    info: number;
    opportunity: number;
    risk: number;
    urgent: number;
  };
  /** Top 3 insights por prioridade */
  highlights: CustomerInsight[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Insight Badges
// ---------------------------------------------------------------------------

export const SEVERITY_BADGES: Record<InsightSeverity, { color: string; icon: string }> = {
  [InsightSeverity.INFO]: { color: 'blue', icon: 'ℹ' },
  [InsightSeverity.OPPORTUNITY]: { color: 'green', icon: '💡' },
  [InsightSeverity.RISK]: { color: 'orange', icon: '⚠' },
  [InsightSeverity.URGENT]: { color: 'red', icon: '🔴' },
};

/** Ordem de prioridade (maior = mais urgente) */
export const SEVERITY_PRIORITY: Record<InsightSeverity, number> = {
  [InsightSeverity.INFO]: 0,
  [InsightSeverity.OPPORTUNITY]: 1,
  [InsightSeverity.RISK]: 2,
  [InsightSeverity.URGENT]: 3,
};

/** Validade padrão dos insights em horas */
export const INSIGHT_TTL_HOURS: Record<InsightSeverity, number> = {
  [InsightSeverity.INFO]: 48,
  [InsightSeverity.OPPORTUNITY]: 24,
  [InsightSeverity.RISK]: 12,
  [InsightSeverity.URGENT]: 4,
};
