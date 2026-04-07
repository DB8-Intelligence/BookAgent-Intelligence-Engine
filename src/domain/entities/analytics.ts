/**
 * Entity: Analytics / Reporting DTOs
 *
 * Visões analíticas consolidadas do sistema.
 *
 * Áreas analíticas:
 *   1. Operations  — jobs, pipeline, filas
 *   2. Content     — outputs, formatos, presets, qualidade
 *   3. Publication — canais, taxas, performance social
 *   4. Tenant      — atividade, uso, crescimento
 *   5. Billing     — receita, planos, churn
 *   6. Learning    — sinais, regras, eficácia
 *
 * Modelo de agregação:
 *   Sem tabela intermediária de snapshots — queries diretas ao Supabase com
 *   filtros temporais. Adequado até ~10K jobs/mês. Para escala maior,
 *   introduzir materialized views ou tabela de aggregates diários.
 *
 * Parte 80: Reporting & Analytics
 */

import type { PlanTier } from '../../plans/plan-config.js';

// ---------------------------------------------------------------------------
// Time Series
// ---------------------------------------------------------------------------

/** Ponto em série temporal */
export interface AnalyticsTimeSeriesPoint {
  /** Label do período (ex: "2026-04-06", "2026-W14", "2026-04") */
  period: string;
  /** Valor */
  value: number;
  /** Label do valor (ex: "jobs", "renders", "USD") */
  label?: string;
}

/** Série temporal com metadados */
export interface AnalyticsTimeSeries {
  name: string;
  unit: string;
  points: AnalyticsTimeSeriesPoint[];
  total: number;
  average: number;
}

/** Granularidade temporal */
export type AnalyticsGranularity = 'day' | 'week' | 'month';

/** Filtro temporal para queries */
export interface AnalyticsTimeFilter {
  /** Início do período (ISO 8601) */
  from: string;
  /** Fim do período (ISO 8601) */
  to: string;
  /** Granularidade */
  granularity: AnalyticsGranularity;
  /** Tenant (null = global / admin) */
  tenantId?: string;
}

// ---------------------------------------------------------------------------
// Operations Analytics
// ---------------------------------------------------------------------------

export interface JobAnalyticsSummary {
  period: { from: string; to: string };
  /** Totais */
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  /** Taxas */
  successRate: number;
  failureRate: number;
  /** Tempos */
  avgDurationMs: number;
  p95DurationMs: number;
  /** Distribuição por status */
  byStatus: Array<{ status: string; count: number }>;
  /** Distribuição por tipo de input */
  byInputType: Array<{ type: string; count: number }>;
  /** Série temporal */
  throughputSeries: AnalyticsTimeSeries;
}

// ---------------------------------------------------------------------------
// Content Analytics
// ---------------------------------------------------------------------------

export interface ContentAnalyticsSummary {
  period: { from: string; to: string };
  /** Artifacts gerados */
  totalArtifacts: number;
  /** Distribuição por formato */
  byFormat: Array<{ format: string; count: number }>;
  /** Distribuição por tipo de artifact */
  byType: Array<{ type: string; count: number }>;
  /** Qualidade média (0-100, do scoring engine) */
  avgQualityScore: number | null;
  /** Variantes geradas */
  totalVariants: number;
  /** Thumbnails geradas */
  totalThumbnails: number;
  /** Presets mais usados */
  topPresets: Array<{ preset: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Publication Analytics
// ---------------------------------------------------------------------------

export interface PublicationAnalyticsSummary {
  period: { from: string; to: string };
  /** Totais */
  totalAttempted: number;
  totalSucceeded: number;
  totalFailed: number;
  successRate: number;
  /** Distribuição por plataforma */
  byPlatform: Array<{ platform: string; total: number; succeeded: number; failed: number; rate: number }>;
  /** Série temporal */
  publicationSeries: AnalyticsTimeSeries;
}

// ---------------------------------------------------------------------------
// Tenant Analytics
// ---------------------------------------------------------------------------

export interface TenantAnalyticsSummary {
  period: { from: string; to: string };
  /** Total de tenants ativos */
  activeTenants: number;
  /** Novos tenants no período */
  newTenants: number;
  /** Top tenants por uso */
  topByUsage: Array<{ tenantId: string; jobCount: number; planTier: string }>;
  /** Distribuição por plano */
  byPlan: Array<{ plan: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Billing Analytics
// ---------------------------------------------------------------------------

export interface BillingAnalyticsSummary {
  period: { from: string; to: string };
  /** Receita estimada (BRL centavos) */
  estimatedRevenueBRL: number;
  /** Custo operacional estimado (USD) */
  estimatedCostUsd: number;
  /** Assinaturas ativas */
  activeSubscriptions: number;
  /** Distribuição por status */
  byStatus: Array<{ status: string; count: number }>;
  /** Distribuição por plano */
  byPlan: Array<{ plan: string; count: number; revenueBRL: number }>;
  /** Churn (cancelamentos no período) */
  cancellations: number;
  /** Upgrades no período */
  upgrades: number;
  /** Downgrades no período */
  downgrades: number;
}

// ---------------------------------------------------------------------------
// Learning Analytics
// ---------------------------------------------------------------------------

export interface LearningAnalyticsSummary {
  period: { from: string; to: string };
  /** Sinais coletados */
  totalSignals: number;
  /** Regras ativas */
  activeRules: number;
  /** Regras aplicadas no período */
  rulesApplied: number;
  /** Taxa de sucesso das regras */
  ruleSuccessRate: number;
  /** Top sinais por fonte */
  bySource: Array<{ source: string; count: number }>;
  /** Top categorias de otimização */
  byCategory: Array<{ category: string; ruleCount: number; avgConfidence: number }>;
}

// ---------------------------------------------------------------------------
// Dashboard Snapshot (consolidated)
// ---------------------------------------------------------------------------

export interface AnalyticsDashboardSnapshot {
  period: { from: string; to: string };
  granularity: AnalyticsGranularity;
  /** Headline KPIs */
  kpis: {
    totalJobs: number;
    successRate: number;
    avgDurationMs: number;
    totalPublications: number;
    publicationSuccessRate: number;
    activeTenants: number;
    estimatedRevenueBRL: number;
    estimatedCostUsd: number;
  };
  /** Resumos por área */
  jobs: JobAnalyticsSummary;
  publications: PublicationAnalyticsSummary;
  tenants: TenantAnalyticsSummary;
  billing: BillingAnalyticsSummary;
  generatedAt: string;
}
