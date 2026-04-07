/**
 * Co-Pilot Engine — Executive Co-Pilot / Operations Advisor
 *
 * Consolida advisories em bundles, gera next best actions,
 * executive summaries e operational summaries.
 *
 * Fluxo:
 *   1. Gerar advisories (via advisory-generator)
 *   2. Priorizar e agrupar
 *   3. Extrair next best actions
 *   4. Construir executive summary (health + KPIs + headline)
 *   5. Construir operational summary (métricas detalhadas)
 *
 * Parte 95: Executive Co-Pilot / Operations Advisor
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  Advisory,
  AdvisoryBundle,
  NextBestAction,
  ExecutiveSummary,
  OperationalSummary,
  HealthIndicator,
} from '../../domain/entities/copilot.js';
import {
  AdvisoryUrgency,
  AdvisorySource,
  MAX_ADVISORIES_PER_BUNDLE,
  MAX_NEXT_BEST_ACTIONS,
} from '../../domain/entities/copilot.js';
import { generateAdvisories } from './advisory-generator.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Advisory Bundle
// ---------------------------------------------------------------------------

/**
 * Generates a prioritized advisory bundle for a tenant.
 */
export async function generateBundle(
  tenantId: string | null,
  supabase: SupabaseClient | null,
): Promise<AdvisoryBundle> {
  const advisories = await generateAdvisories(tenantId, supabase);

  // Limit to max
  const limited = advisories.slice(0, MAX_ADVISORIES_PER_BUNDLE);

  // Extract next best actions
  const nextBestActions = extractNextBestActions(limited);

  const totalCritical = limited.filter((a) => a.urgency === AdvisoryUrgency.CRITICAL).length;
  const totalHigh = limited.filter((a) => a.urgency === AdvisoryUrgency.HIGH).length;

  logger.info(
    `[CoPilot] Bundle for tenant=${tenantId ?? 'global'}: ` +
    `${limited.length} advisories, ${nextBestActions.length} NBAs, ` +
    `${totalCritical} critical, ${totalHigh} high`,
  );

  return {
    tenantId,
    advisories: limited,
    nextBestActions,
    totalActive: limited.length,
    totalCritical,
    totalHigh,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Next Best Actions
// ---------------------------------------------------------------------------

function extractNextBestActions(advisories: Advisory[]): NextBestAction[] {
  // Top N advisories by priority become next best actions
  const top = advisories.slice(0, MAX_NEXT_BEST_ACTIONS);

  return top.map((adv) => ({
    id: uuid(),
    title: adv.title,
    description: adv.description,
    category: adv.category,
    urgency: adv.urgency,
    expectedImpact: deriveExpectedImpact(adv),
    steps: deriveSteps(adv),
    rationale: adv.rationale,
    relatedAdvisoryIds: [adv.id],
  }));
}

function deriveExpectedImpact(adv: Advisory): string {
  switch (adv.urgency) {
    case AdvisoryUrgency.CRITICAL:
      return 'Resolving this prevents potential system block or data loss';
    case AdvisoryUrgency.HIGH:
      return 'Addressing this significantly improves operational flow';
    case AdvisoryUrgency.MEDIUM:
      return 'Acting on this optimizes performance and efficiency';
    case AdvisoryUrgency.LOW:
      return 'This improves long-term outcomes';
    default:
      return 'Informational — no immediate impact expected';
  }
}

function deriveSteps(adv: Advisory): string[] {
  const steps: string[] = [];

  steps.push(`Review: ${adv.description}`);

  if (adv.actionEndpoint) {
    steps.push(`Access: ${adv.actionEndpoint}`);
  }

  steps.push(`Action: ${adv.suggestedAction}`);

  if (adv.urgency === AdvisoryUrgency.CRITICAL || adv.urgency === AdvisoryUrgency.HIGH) {
    steps.push('Verify: Confirm the issue is resolved after taking action');
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Executive Summary
// ---------------------------------------------------------------------------

/**
 * Generates an executive summary for a tenant.
 */
export async function generateExecutiveSummary(
  tenantId: string | null,
  supabase: SupabaseClient | null,
): Promise<ExecutiveSummary> {
  const bundle = await generateBundle(tenantId, supabase);
  const opsSummary = await generateOperationalSummary(tenantId, supabase);

  // Determine overall health
  let overallHealth: ExecutiveSummary['overallHealth'] = 'healthy';
  if (bundle.totalCritical > 0) overallHealth = 'critical';
  else if (bundle.totalHigh > 0 || opsSummary.stuckStates > 0) overallHealth = 'warning';

  // Build health indicators
  const healthIndicators = buildHealthIndicators(opsSummary, bundle);

  // Build KPIs
  const kpis: Record<string, number | string> = {
    activeCampaigns: opsSummary.activeCampaigns,
    avgProgress: `${opsSummary.avgCampaignProgress}%`,
    recentPublications: opsSummary.recentPublications,
    pendingDecisions: opsSummary.pendingDecisions,
    billingUtilization: `${opsSummary.billingUtilization}%`,
    activeAdvisories: bundle.totalActive,
  };

  // Headline
  const headline = buildHeadline(overallHealth, bundle, opsSummary);

  // Determine trend
  const trend = determineTrend(opsSummary, bundle);

  // Top advisories
  const topAdvisories = bundle.advisories.slice(0, 3);
  const nextBestAction = bundle.nextBestActions.length > 0 ? bundle.nextBestActions[0] : null;

  return {
    tenantId,
    overallHealth,
    headline,
    healthIndicators,
    kpis,
    topAdvisories,
    nextBestAction,
    trend,
    generatedAt: new Date().toISOString(),
  };
}

function buildHealthIndicators(
  ops: OperationalSummary,
  bundle: AdvisoryBundle,
): HealthIndicator[] {
  const indicators: HealthIndicator[] = [];

  // Campaigns
  indicators.push({
    dimension: 'Campaigns',
    status: ops.activeCampaigns > 0 ? (ops.avgCampaignProgress > 50 ? 'healthy' : 'warning') : 'unknown',
    value: `${ops.activeCampaigns} active`,
    detail: `Average progress: ${ops.avgCampaignProgress}%`,
  });

  // Publications
  indicators.push({
    dimension: 'Publications',
    status: ops.pendingPublications > 10 ? 'warning' : (ops.pendingPublications > 0 ? 'healthy' : 'unknown'),
    value: `${ops.recentPublications} recent, ${ops.pendingPublications} pending`,
    detail: ops.pendingPublications > 10 ? 'High number of pending publications' : 'Normal flow',
  });

  // Billing
  indicators.push({
    dimension: 'Billing',
    status: ops.billingUtilization >= 95 ? 'critical' : (ops.billingUtilization >= 80 ? 'warning' : 'healthy'),
    value: `${ops.billingUtilization}% utilized`,
    detail: ops.billingUtilization >= 80 ? 'Approaching plan limit' : 'Within plan limits',
  });

  // Governance
  indicators.push({
    dimension: 'Governance',
    status: ops.pendingCheckpoints > 5 ? 'warning' : 'healthy',
    value: `${ops.pendingCheckpoints} pending checkpoints`,
    detail: `${ops.pendingDecisions} decision(s) need escalation`,
  });

  // Recovery
  indicators.push({
    dimension: 'System Health',
    status: ops.stuckStates > 0 ? 'warning' : 'healthy',
    value: ops.stuckStates > 0 ? `${ops.stuckStates} stuck states` : 'All clear',
    detail: ops.stuckStates > 0 ? 'Recovery intervention may be needed' : 'No issues detected',
  });

  return indicators;
}

function buildHeadline(
  health: string,
  bundle: AdvisoryBundle,
  ops: OperationalSummary,
): string {
  if (health === 'critical') {
    return `Action required: ${bundle.totalCritical} critical issue(s) need immediate attention.`;
  }
  if (health === 'warning') {
    const issues: string[] = [];
    if (bundle.totalHigh > 0) issues.push(`${bundle.totalHigh} high-priority advisory(ies)`);
    if (ops.stuckStates > 0) issues.push(`${ops.stuckStates} stuck state(s)`);
    if (ops.pendingDecisions > 0) issues.push(`${ops.pendingDecisions} pending decision(s)`);
    return `Attention needed: ${issues.join(', ')}.`;
  }
  if (ops.activeCampaigns > 0) {
    return `Operations running smoothly. ${ops.activeCampaigns} campaign(s) active at ${ops.avgCampaignProgress}% average progress.`;
  }
  return 'System is healthy. No urgent items.';
}

function determineTrend(
  ops: OperationalSummary,
  bundle: AdvisoryBundle,
): ExecutiveSummary['trend'] {
  if (bundle.totalCritical > 0 || ops.stuckStates > 3) return 'declining';
  if (ops.activeCampaigns === 0 && ops.recentPublications === 0) return 'insufficient_data';
  if (bundle.totalHigh === 0 && ops.avgCampaignProgress > 40) return 'improving';
  return 'stable';
}

// ---------------------------------------------------------------------------
// Operational Summary
// ---------------------------------------------------------------------------

/**
 * Generates an operational summary for a tenant.
 */
export async function generateOperationalSummary(
  tenantId: string | null,
  supabase: SupabaseClient | null,
): Promise<OperationalSummary> {
  const summary: OperationalSummary = {
    tenantId,
    activeCampaigns: 0,
    avgCampaignProgress: 0,
    recentPublications: 0,
    pendingPublications: 0,
    activeSchedules: 0,
    pendingDecisions: 0,
    stuckStates: 0,
    billingUtilization: 0,
    pendingCheckpoints: 0,
    advisoriesByUrgency: {},
    generatedAt: new Date().toISOString(),
  };

  if (!supabase || !tenantId) return summary;

  const filter = [{ column: 'tenant_id', operator: 'eq' as const, value: tenantId }];

  // Campaigns
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_campaigns', {
      filters: filter,
      select: 'id,status,progress',
      limit: 100,
    });
    const active = rows.filter((r) => r['status'] === 'active' || r['status'] === 'in_progress');
    summary.activeCampaigns = active.length;
    if (active.length > 0) {
      summary.avgCampaignProgress = Math.round(
        active.reduce((s, r) => s + ((r['progress'] as number) ?? 0), 0) / active.length,
      );
    }
  } catch { /* graceful */ }

  // Publications
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_publications', {
      filters: filter,
      select: 'id,status',
      limit: 200,
    });
    summary.recentPublications = rows.length;
    summary.pendingPublications = rows.filter((r) => r['status'] === 'pending').length;
  } catch { /* graceful */ }

  // Schedules
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_campaign_schedules', {
      filters: filter,
      select: 'id,status',
      limit: 50,
    });
    summary.activeSchedules = rows.filter((r) => r['status'] === 'active' || r['status'] === 'in_progress').length;
  } catch { /* graceful */ }

  // Decisions
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_decisions', {
      filters: [
        { column: 'tenant_id', operator: 'eq', value: tenantId },
        { column: 'status', operator: 'eq', value: 'pending' },
      ],
      select: 'id',
      limit: 50,
    });
    summary.pendingDecisions = rows.length;
  } catch { /* graceful */ }

  // Billing
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_usage_counters', {
      filters: filter,
      select: 'jobs_used,jobs_limit',
      limit: 1,
    });
    if (rows.length > 0) {
      const used = (rows[0]['jobs_used'] as number) ?? 0;
      const limit = (rows[0]['jobs_limit'] as number) ?? 999;
      summary.billingUtilization = limit > 0 ? Math.round((used / limit) * 100) : 0;
    }
  } catch { /* graceful */ }

  // Governance checkpoints
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_governance_decisions', {
      filters: [
        { column: 'tenant_id', operator: 'eq', value: tenantId },
        { column: 'decision_result', operator: 'eq', value: 'checkpoint_required' },
      ],
      select: 'id',
      limit: 50,
    });
    summary.pendingCheckpoints = rows.length;
  } catch { /* graceful */ }

  // Recovery stuck
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_recovery_log', {
      filters: [
        { column: 'tenant_id', operator: 'eq', value: tenantId },
        { column: 'result', operator: 'eq', value: 'failed' },
      ],
      select: 'id',
      limit: 50,
    });
    summary.stuckStates = rows.length;
  } catch { /* graceful */ }

  return summary;
}

// ---------------------------------------------------------------------------
// Overview (combines everything)
// ---------------------------------------------------------------------------

export interface CoPilotOverview {
  executiveSummary: ExecutiveSummary;
  operationalSummary: OperationalSummary;
  bundle: AdvisoryBundle;
  generatedAt: string;
}

/**
 * Generates the complete co-pilot overview.
 */
export async function generateOverview(
  tenantId: string | null,
  supabase: SupabaseClient | null,
): Promise<CoPilotOverview> {
  const operationalSummary = await generateOperationalSummary(tenantId, supabase);
  const bundle = await generateBundle(tenantId, supabase);

  // Executive summary reuses ops + bundle
  const executiveSummary = await buildExecutiveSummaryFromParts(
    tenantId, operationalSummary, bundle,
  );

  return {
    executiveSummary,
    operationalSummary,
    bundle,
    generatedAt: new Date().toISOString(),
  };
}

async function buildExecutiveSummaryFromParts(
  tenantId: string | null,
  ops: OperationalSummary,
  bundle: AdvisoryBundle,
): Promise<ExecutiveSummary> {
  let overallHealth: ExecutiveSummary['overallHealth'] = 'healthy';
  if (bundle.totalCritical > 0) overallHealth = 'critical';
  else if (bundle.totalHigh > 0 || ops.stuckStates > 0) overallHealth = 'warning';

  return {
    tenantId,
    overallHealth,
    headline: buildHeadline(overallHealth, bundle, ops),
    healthIndicators: buildHealthIndicators(ops, bundle),
    kpis: {
      activeCampaigns: ops.activeCampaigns,
      avgProgress: `${ops.avgCampaignProgress}%`,
      recentPublications: ops.recentPublications,
      pendingDecisions: ops.pendingDecisions,
      billingUtilization: `${ops.billingUtilization}%`,
      activeAdvisories: bundle.totalActive,
    },
    topAdvisories: bundle.advisories.slice(0, 3),
    nextBestAction: bundle.nextBestActions[0] ?? null,
    trend: determineTrend(ops, bundle),
    generatedAt: new Date().toISOString(),
  };
}
