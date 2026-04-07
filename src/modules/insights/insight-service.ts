/**
 * Insight Service — Customer Insights & Recommendation
 *
 * Orquestra geração de insights, consolida recomendações
 * e produz snapshots para o dashboard.
 *
 * Parte 82: Customer Insights & Recommendation
 */

import type {
  CustomerInsight,
  Recommendation,
  TenantInsightSnapshot,
  RecommendationAction,
} from '../../domain/entities/insight.js';
import {
  InsightSeverity,
  InsightCategory,
  SEVERITY_PRIORITY,
} from '../../domain/entities/insight.js';
import type { TenantContext } from '../../domain/entities/tenant.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { generateInsights } from './insight-generator.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Get Full Snapshot
// ---------------------------------------------------------------------------

/**
 * Gera snapshot completo de insights para um tenant.
 */
export async function getInsightSnapshot(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<TenantInsightSnapshot> {
  const insights = await generateInsights(tenantCtx, supabase);

  // Sort by severity (urgent first)
  const sorted = [...insights].sort(
    (a, b) => SEVERITY_PRIORITY[b.severity] - SEVERITY_PRIORITY[a.severity],
  );

  // Build recommendations from insights
  const recommendations = buildRecommendations(sorted);

  // Counts
  const counts = {
    info: insights.filter((i) => i.severity === InsightSeverity.INFO).length,
    opportunity: insights.filter((i) => i.severity === InsightSeverity.OPPORTUNITY).length,
    risk: insights.filter((i) => i.severity === InsightSeverity.RISK).length,
    urgent: insights.filter((i) => i.severity === InsightSeverity.URGENT).length,
  };

  return {
    tenantId: tenantCtx.tenantId,
    planTier: tenantCtx.planTier,
    insights: sorted,
    recommendations,
    counts,
    highlights: sorted.slice(0, 3),
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Get Insights by Category
// ---------------------------------------------------------------------------

/**
 * Retorna insights filtrados por categoria.
 */
export async function getInsightsByCategory(
  tenantCtx: TenantContext,
  category: InsightCategory,
  supabase: SupabaseClient | null,
): Promise<CustomerInsight[]> {
  const insights = await generateInsights(tenantCtx, supabase);
  return insights
    .filter((i) => i.category === category)
    .sort((a, b) => SEVERITY_PRIORITY[b.severity] - SEVERITY_PRIORITY[a.severity]);
}

/**
 * Retorna apenas recomendações (insights com ação).
 */
export async function getRecommendations(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<Recommendation[]> {
  const insights = await generateInsights(tenantCtx, supabase);
  const sorted = [...insights].sort(
    (a, b) => SEVERITY_PRIORITY[b.severity] - SEVERITY_PRIORITY[a.severity],
  );
  return buildRecommendations(sorted);
}

// ---------------------------------------------------------------------------
// Build Recommendations
// ---------------------------------------------------------------------------

function buildRecommendations(insights: CustomerInsight[]): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Group actionable insights by type to avoid duplicates
  const seen = new Set<string>();

  for (const insight of insights) {
    if (insight.severity === InsightSeverity.INFO) continue; // info = no action needed
    if (seen.has(insight.type)) continue;
    seen.add(insight.type);

    const actions: RecommendationAction[] = [];
    if (insight.action) actions.push(insight.action);

    // Add dismiss action
    actions.push({ label: 'Dispensar', actionType: 'dismiss' });

    const impactMap: Record<InsightSeverity, string> = {
      [InsightSeverity.INFO]: 'Baixo',
      [InsightSeverity.OPPORTUNITY]: 'Médio — pode melhorar resultados',
      [InsightSeverity.RISK]: 'Alto — pode impactar operação',
      [InsightSeverity.URGENT]: 'Crítico — ação imediata necessária',
    };

    recommendations.push({
      id: `rec_${insight.id}`,
      title: insight.title,
      description: insight.message,
      category: insight.category,
      severity: insight.severity,
      estimatedImpact: impactMap[insight.severity],
      actions,
      sourceInsightIds: [insight.id],
      confidence: insight.evidence.confidence ?? 0.7,
    });
  }

  return recommendations;
}
