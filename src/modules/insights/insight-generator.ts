/**
 * Insight Generator — Customer Insights & Recommendation
 *
 * Gera insights acionáveis a partir de dados reais do tenant:
 *   - Analytics (Parte 80)
 *   - Learning rules (Parte 73)
 *   - Scoring (Parte 70)
 *   - Usage/billing (Parte 75)
 *   - Publication results (Parte 67)
 *   - Review/revision patterns (Parte 68-69)
 *
 * Cada gerador produz CustomerInsight[] baseado em critérios objetivos.
 * Insights são explicáveis, tenant-scoped e não automáticos.
 *
 * Parte 82: Customer Insights & Recommendation
 */

import { v4 as uuid } from 'uuid';

import type {
  CustomerInsight,
  InsightEvidence,
  RecommendationAction,
} from '../../domain/entities/insight.js';
import {
  InsightCategory,
  InsightType,
  InsightSeverity,
  INSIGHT_TTL_HOURS,
} from '../../domain/entities/insight.js';
import type { TenantContext } from '../../domain/entities/tenant.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { getUsageSummary } from '../billing/limit-checker.js';
import { getSubscription } from '../billing/subscription-manager.js';
import { defaultTimeFilter, getJobAnalytics, getPublicationAnalytics } from '../analytics/analytics-service.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Generate All Insights
// ---------------------------------------------------------------------------

/**
 * Gera todos os insights para um tenant.
 */
export async function generateInsights(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<CustomerInsight[]> {
  const insights: CustomerInsight[] = [];
  const tid = tenantCtx.tenantId;

  const [contentInsights, publishingInsights, usageInsights, performanceInsights, planInsights] =
    await Promise.all([
      generateContentInsights(tenantCtx, supabase),
      generatePublishingInsights(tenantCtx, supabase),
      generateUsageInsights(tenantCtx, supabase),
      generatePerformanceInsights(tenantCtx, supabase),
      generatePlanInsights(tenantCtx, supabase),
    ]);

  insights.push(...contentInsights, ...publishingInsights, ...usageInsights, ...performanceInsights, ...planInsights);

  logger.info(
    `[InsightGenerator] Generated ${insights.length} insights for tenant=${tid}: ` +
    `content=${contentInsights.length} publishing=${publishingInsights.length} ` +
    `usage=${usageInsights.length} performance=${performanceInsights.length} plan=${planInsights.length}`,
  );

  return insights;
}

// ---------------------------------------------------------------------------
// Content Insights
// ---------------------------------------------------------------------------

async function generateContentInsights(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<CustomerInsight[]> {
  const insights: CustomerInsight[] = [];
  const tid = tenantCtx.tenantId;
  const filter = defaultTimeFilter(tid);

  const jobs = await getJobAnalytics(filter, supabase);

  // High rejection rate
  if (jobs.totalJobs >= 5) {
    const rejectionStatuses = ['intermediate_rejected', 'final_rejected'];
    const rejections = jobs.byStatus
      .filter((s) => rejectionStatuses.includes(s.status))
      .reduce((sum, s) => sum + s.count, 0);
    const rejectionRate = Math.round((rejections / jobs.totalJobs) * 100);

    if (rejectionRate > 30) {
      insights.push(createInsight(tid, {
        category: InsightCategory.CONTENT,
        type: InsightType.HIGH_REJECTION_RATE,
        severity: rejectionRate > 50 ? InsightSeverity.RISK : InsightSeverity.OPPORTUNITY,
        title: 'Taxa de reprovação alta',
        message: `${rejectionRate}% dos seus jobs foram reprovados nos últimos 30 dias. Considere revisar os inputs ou ajustar expectativas.`,
        evidence: {
          metric: 'rejection_rate',
          currentValue: rejectionRate,
          referenceValue: 15,
          referenceLabel: 'média da plataforma',
          sampleSize: jobs.totalJobs,
        },
      }));
    }
  }

  // Quality trend (from job success rate as proxy)
  if (jobs.totalJobs >= 10 && jobs.successRate > 80) {
    insights.push(createInsight(tid, {
      category: InsightCategory.CONTENT,
      type: InsightType.QUALITY_TREND,
      severity: InsightSeverity.INFO,
      title: 'Qualidade consistente',
      message: `${jobs.successRate}% dos seus jobs foram aprovados. Sua taxa de sucesso está acima da média.`,
      evidence: {
        metric: 'success_rate',
        currentValue: jobs.successRate,
        referenceValue: 70,
        referenceLabel: 'média da plataforma',
        sampleSize: jobs.totalJobs,
      },
    }));
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Publishing Insights
// ---------------------------------------------------------------------------

async function generatePublishingInsights(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<CustomerInsight[]> {
  const insights: CustomerInsight[] = [];
  const tid = tenantCtx.tenantId;

  if (!tenantCtx.features.autoPublish) {
    // Suggest auto publish for pro plan
    insights.push(createInsight(tid, {
      category: InsightCategory.PUBLISHING,
      type: InsightType.AUTO_PUBLISH_SUGGESTION,
      severity: InsightSeverity.OPPORTUNITY,
      title: 'Publicação automática disponível',
      message: 'Ative a publicação automática para enviar conteúdo diretamente ao Instagram e Facebook sem intervenção manual.',
      evidence: { metric: 'feature_available', currentValue: 'false' },
      action: { label: 'Fazer upgrade', actionType: 'navigate', target: '/dashboard/billing' },
    }));
    return insights;
  }

  const filter = defaultTimeFilter(tid);
  const pubs = await getPublicationAnalytics(filter, supabase);

  if (pubs.totalAttempted < 3) return insights;

  // Best channel
  const bestPlatform = pubs.byPlatform
    .filter((p) => p.total >= 2)
    .sort((a, b) => b.rate - a.rate)[0];

  if (bestPlatform && bestPlatform.rate > 80) {
    insights.push(createInsight(tid, {
      category: InsightCategory.PUBLISHING,
      type: InsightType.BEST_CHANNEL,
      severity: InsightSeverity.INFO,
      title: `${bestPlatform.platform} é seu melhor canal`,
      message: `${bestPlatform.rate}% de sucesso em ${bestPlatform.total} publicações no ${bestPlatform.platform}.`,
      evidence: {
        metric: 'publication_success_rate',
        currentValue: bestPlatform.rate,
        sampleSize: bestPlatform.total,
      },
    }));
  }

  // Worst channel
  const worstPlatform = pubs.byPlatform
    .filter((p) => p.total >= 2 && p.failed > 0)
    .sort((a, b) => a.rate - b.rate)[0];

  if (worstPlatform && worstPlatform.rate < 60) {
    insights.push(createInsight(tid, {
      category: InsightCategory.PUBLISHING,
      type: InsightType.WORST_CHANNEL,
      severity: InsightSeverity.RISK,
      title: `Falhas frequentes no ${worstPlatform.platform}`,
      message: `${worstPlatform.failed} falhas em ${worstPlatform.total} tentativas no ${worstPlatform.platform}. Verifique tokens de acesso.`,
      evidence: {
        metric: 'publication_failure_count',
        currentValue: worstPlatform.failed,
        referenceValue: worstPlatform.total,
        referenceLabel: 'total de tentativas',
      },
    }));
  }

  // Failure spike
  if (pubs.totalFailed > 5 && pubs.successRate < 50) {
    insights.push(createInsight(tid, {
      category: InsightCategory.PUBLISHING,
      type: InsightType.PUBLISH_FAILURE_SPIKE,
      severity: InsightSeverity.URGENT,
      title: 'Pico de falhas de publicação',
      message: `${pubs.totalFailed} publicações falharam recentemente. Taxa de sucesso: ${pubs.successRate}%.`,
      evidence: {
        metric: 'publication_success_rate',
        currentValue: pubs.successRate,
        referenceValue: 85,
        referenceLabel: 'meta',
        sampleSize: pubs.totalAttempted,
      },
    }));
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Usage Insights
// ---------------------------------------------------------------------------

async function generateUsageInsights(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<CustomerInsight[]> {
  const insights: CustomerInsight[] = [];
  const tid = tenantCtx.tenantId;

  const usage = await getUsageSummary(tenantCtx, supabase);

  for (const feat of usage.features) {
    // Quota approaching
    if (feat.status === 'warning' && feat.usedPercent >= 80) {
      insights.push(createInsight(tid, {
        category: InsightCategory.USAGE,
        type: InsightType.QUOTA_APPROACHING,
        severity: InsightSeverity.RISK,
        title: `${feat.label}: ${feat.usedPercent}% utilizado`,
        message: `Você usou ${feat.used} de ${feat.limit} ${feat.label} este mês. Considere fazer upgrade para evitar bloqueios.`,
        evidence: {
          metric: feat.label,
          currentValue: feat.used,
          referenceValue: feat.limit,
          referenceLabel: 'limite do plano',
        },
        action: { label: 'Ver planos', actionType: 'navigate', target: '/dashboard/billing' },
      }));
    }

    // Blocked
    if (feat.status === 'blocked') {
      insights.push(createInsight(tid, {
        category: InsightCategory.USAGE,
        type: InsightType.QUOTA_APPROACHING,
        severity: InsightSeverity.URGENT,
        title: `Limite atingido: ${feat.label}`,
        message: `${feat.used}/${feat.limit} ${feat.label} utilizados. Novas operações estão bloqueadas.`,
        evidence: {
          metric: feat.label,
          currentValue: feat.used,
          referenceValue: feat.limit,
          referenceLabel: 'limite do plano',
        },
        action: { label: 'Fazer upgrade', actionType: 'navigate', target: '/dashboard/billing' },
      }));
    }

    // Feature disabled but could be useful
    if (feat.status === 'feature_disabled' && feat.limit === 0) {
      // Only suggest features the user might benefit from
      const usefulDisabled = ['Publicações automáticas', 'Experimentos A/B', 'Landing pages geradas'];
      if (usefulDisabled.includes(feat.label)) {
        insights.push(createInsight(tid, {
          category: InsightCategory.USAGE,
          type: InsightType.UNUSED_FEATURE,
          severity: InsightSeverity.OPPORTUNITY,
          title: `${feat.label} disponível no plano Pro`,
          message: `Ative ${feat.label} com upgrade para o plano Pro e aumente seus resultados.`,
          evidence: { metric: feat.label, currentValue: 'disabled' },
          action: { label: 'Ver planos', actionType: 'navigate', target: '/dashboard/billing' },
        }));
      }
    }
  }

  // Inefficient usage: low utilization on paid plan
  const jobsFeat = usage.features.find((f) => f.label === 'Jobs criados');
  if (jobsFeat && jobsFeat.limit > 0 && jobsFeat.usedPercent < 20 && tenantCtx.planTier !== 'basic') {
    insights.push(createInsight(tid, {
      category: InsightCategory.USAGE,
      type: InsightType.INEFFICIENT_USAGE,
      severity: InsightSeverity.INFO,
      title: 'Plano subutilizado',
      message: `Você usou apenas ${jobsFeat.usedPercent}% dos jobs disponíveis no plano ${tenantCtx.planTier}. Considere otimizar seu uso ou verificar se o plano atual é adequado.`,
      evidence: {
        metric: 'jobs_utilization',
        currentValue: jobsFeat.usedPercent,
        referenceValue: 50,
        referenceLabel: 'uso recomendado',
      },
    }));
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Performance Insights
// ---------------------------------------------------------------------------

async function generatePerformanceInsights(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<CustomerInsight[]> {
  const insights: CustomerInsight[] = [];
  const tid = tenantCtx.tenantId;
  const filter = defaultTimeFilter(tid);

  const jobs = await getJobAnalytics(filter, supabase);

  if (jobs.totalJobs < 3) return insights;

  // High failure rate
  if (jobs.failureRate > 25) {
    insights.push(createInsight(tid, {
      category: InsightCategory.PERFORMANCE,
      type: InsightType.FAILURE_RATE_HIGH,
      severity: jobs.failureRate > 50 ? InsightSeverity.URGENT : InsightSeverity.RISK,
      title: 'Taxa de falha elevada',
      message: `${jobs.failureRate}% dos seus jobs falharam nos últimos 30 dias (${jobs.failedJobs} de ${jobs.totalJobs}). Verifique seus inputs e reporte se o problema persistir.`,
      evidence: {
        metric: 'job_failure_rate',
        currentValue: jobs.failureRate,
        referenceValue: 10,
        referenceLabel: 'meta',
        sampleSize: jobs.totalJobs,
      },
    }));
  }

  // Good performance
  if (jobs.failureRate < 5 && jobs.totalJobs >= 10) {
    insights.push(createInsight(tid, {
      category: InsightCategory.PERFORMANCE,
      type: InsightType.IMPROVEMENT_DETECTED,
      severity: InsightSeverity.INFO,
      title: 'Performance excelente',
      message: `Apenas ${jobs.failureRate}% de falha em ${jobs.totalJobs} jobs. Seu uso do sistema está muito eficiente.`,
      evidence: {
        metric: 'job_failure_rate',
        currentValue: jobs.failureRate,
        referenceValue: 10,
        referenceLabel: 'média da plataforma',
        sampleSize: jobs.totalJobs,
      },
    }));
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Plan Insights
// ---------------------------------------------------------------------------

async function generatePlanInsights(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<CustomerInsight[]> {
  const insights: CustomerInsight[] = [];
  const tid = tenantCtx.tenantId;

  const sub = await getSubscription(tid, supabase);

  // Trial expiring
  if (sub?.status === 'trial' && sub.trialEndsAt) {
    const daysLeft = Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / 86400000);
    if (daysLeft <= 5 && daysLeft > 0) {
      insights.push(createInsight(tid, {
        category: InsightCategory.PLAN,
        type: InsightType.TRIAL_EXPIRING,
        severity: daysLeft <= 2 ? InsightSeverity.URGENT : InsightSeverity.RISK,
        title: `Trial expira em ${daysLeft} dia(s)`,
        message: 'Faça upgrade para manter acesso a todos os recursos e não perder seu histórico de uso.',
        evidence: { metric: 'trial_days_remaining', currentValue: daysLeft },
        action: { label: 'Fazer upgrade', actionType: 'navigate', target: '/dashboard/billing' },
      }));
    }
  }

  // Billing issue
  if (sub?.status === 'past_due') {
    insights.push(createInsight(tid, {
      category: InsightCategory.PLAN,
      type: InsightType.BILLING_ISSUE,
      severity: InsightSeverity.URGENT,
      title: 'Problema de pagamento',
      message: 'Seu último pagamento não foi processado. Atualize seus dados para evitar suspensão do serviço.',
      evidence: { metric: 'subscription_status', currentValue: 'past_due' },
      action: { label: 'Atualizar pagamento', actionType: 'navigate', target: '/dashboard/billing' },
    }));
  }

  // Upgrade recommendation (basic hitting limits)
  if (tenantCtx.planTier === 'basic') {
    const usage = await getUsageSummary(tenantCtx, supabase);
    const highUsageFeatures = usage.features.filter((f) => f.usedPercent >= 70 && f.limit > 0);

    if (highUsageFeatures.length >= 2) {
      insights.push(createInsight(tid, {
        category: InsightCategory.PLAN,
        type: InsightType.UPGRADE_RECOMMENDED,
        severity: InsightSeverity.OPPORTUNITY,
        title: 'Upgrade recomendado',
        message: `Você está usando ${highUsageFeatures.length} recursos no limite do plano básico. O plano Pro oferece 5x mais capacidade e publicação automática.`,
        evidence: {
          metric: 'features_near_limit',
          currentValue: highUsageFeatures.length,
          referenceValue: 2,
          referenceLabel: 'threshold para upgrade',
        },
        action: { label: 'Ver plano Pro', actionType: 'navigate', target: '/dashboard/billing' },
      }));
    }
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CreateInsightInput {
  category: InsightCategory;
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  message: string;
  evidence: InsightEvidence;
  action?: RecommendationAction;
}

function createInsight(tenantId: string, input: CreateInsightInput): CustomerInsight {
  const now = new Date();
  const ttlHours = INSIGHT_TTL_HOURS[input.severity];

  return {
    id: uuid(),
    category: input.category,
    type: input.type,
    severity: input.severity,
    title: input.title,
    message: input.message,
    evidence: input.evidence,
    action: input.action,
    tenantId,
    generatedAt: now,
    expiresAt: new Date(now.getTime() + ttlHours * 3600000),
  };
}
