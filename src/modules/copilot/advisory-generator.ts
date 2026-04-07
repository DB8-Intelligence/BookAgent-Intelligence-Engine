/**
 * Advisory Generator — Executive Co-Pilot
 *
 * Gera advisories a partir do estado atual do tenant,
 * consultando múltiplas fontes de dados do sistema.
 *
 * Fontes:
 *   - Decisions pendentes de escalação
 *   - Publications stuck/pending
 *   - Campaigns com baixo progresso
 *   - Billing perto do limite
 *   - Governance checkpoints pendentes
 *   - Recovery stuck states
 *   - Simulation recommendations
 *   - Knowledge graph insights
 *
 * Parte 95: Executive Co-Pilot / Operations Advisor
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type { Advisory } from '../../domain/entities/copilot.js';
import {
  AdvisoryCategory,
  AdvisoryUrgency,
  AdvisoryAudience,
  AdvisoryStatus,
  AdvisorySource,
  URGENCY_WEIGHT,
} from '../../domain/entities/copilot.js';

// ---------------------------------------------------------------------------
// Main Generator
// ---------------------------------------------------------------------------

/**
 * Generates all applicable advisories for a tenant.
 */
export async function generateAdvisories(
  tenantId: string | null,
  supabase: SupabaseClient | null,
): Promise<Advisory[]> {
  const advisories: Advisory[] = [];

  if (!supabase || !tenantId) return advisories;

  await checkPendingDecisions(tenantId, supabase, advisories);
  await checkPublicationState(tenantId, supabase, advisories);
  await checkCampaignState(tenantId, supabase, advisories);
  await checkBillingState(tenantId, supabase, advisories);
  await checkGovernanceState(tenantId, supabase, advisories);
  await checkRecoveryState(tenantId, supabase, advisories);
  await checkSimulationRecommendations(tenantId, supabase, advisories);

  // Sort by priority (highest first)
  advisories.sort((a, b) => b.priority - a.priority);

  return advisories;
}

// ---------------------------------------------------------------------------
// Advisory Factory
// ---------------------------------------------------------------------------

function createAdvisory(
  tenantId: string | null,
  category: AdvisoryCategory,
  urgency: AdvisoryUrgency,
  audience: AdvisoryAudience,
  title: string,
  description: string,
  suggestedAction: string,
  sources: AdvisorySource[],
  evidences: string[],
  opts?: {
    actionEndpoint?: string;
    relatedEntityId?: string;
    relatedEntityType?: string;
    confidence?: number;
  },
): Advisory {
  return {
    id: uuid(),
    tenantId,
    category,
    urgency,
    audience,
    status: AdvisoryStatus.ACTIVE,
    title,
    description,
    rationale: {
      summary: `Based on ${sources.map((s) => s).join(', ')}`,
      evidences,
      sources,
      confidence: opts?.confidence ?? 70,
    },
    suggestedAction,
    actionEndpoint: opts?.actionEndpoint ?? null,
    relatedEntityId: opts?.relatedEntityId ?? null,
    relatedEntityType: opts?.relatedEntityType ?? null,
    priority: URGENCY_WEIGHT[urgency],
    createdAt: new Date().toISOString(),
    expiresAt: null,
  };
}

// ---------------------------------------------------------------------------
// Source Checkers
// ---------------------------------------------------------------------------

async function checkPendingDecisions(
  tenantId: string,
  supabase: SupabaseClient,
  advisories: Advisory[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_decisions', {
      filters: [
        { column: 'tenant_id', operator: 'eq', value: tenantId },
        { column: 'status', operator: 'eq', value: 'pending' },
      ],
      select: 'id,type,question',
      limit: 20,
    });

    if (rows.length > 0) {
      advisories.push(createAdvisory(
        tenantId,
        AdvisoryCategory.GOVERNANCE_ESCALATION,
        rows.length >= 3 ? AdvisoryUrgency.HIGH : AdvisoryUrgency.MEDIUM,
        AdvisoryAudience.ACCOUNT_OWNER,
        `${rows.length} Decision(s) Pending Escalation`,
        `There are ${rows.length} system decision(s) requiring human review. ` +
        `Unresolved decisions may block campaign execution and publication workflows.`,
        'Review and resolve pending decisions via the decisions dashboard',
        [AdvisorySource.DECISION_ENGINE],
        rows.map((r) => `Decision "${r['type']}": ${r['question']}`).slice(0, 5),
        { actionEndpoint: 'GET /decisions/pending' },
      ));
    }
  } catch { /* graceful */ }
}

async function checkPublicationState(
  tenantId: string,
  supabase: SupabaseClient,
  advisories: Advisory[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_publications', {
      filters: [
        { column: 'tenant_id', operator: 'eq', value: tenantId },
        { column: 'status', operator: 'eq', value: 'pending' },
      ],
      select: 'id,created_at',
      limit: 50,
    });

    if (rows.length >= 5) {
      advisories.push(createAdvisory(
        tenantId,
        AdvisoryCategory.PUBLICATION_RISK,
        rows.length >= 10 ? AdvisoryUrgency.HIGH : AdvisoryUrgency.MEDIUM,
        AdvisoryAudience.TENANT,
        `${rows.length} Publications Pending`,
        `${rows.length} publication(s) are stuck in pending status. ` +
        `This may indicate approval bottlenecks or integration issues with publication channels.`,
        'Review pending publications and approve or resolve blockers',
        [AdvisorySource.PUBLICATION_STATE],
        [`${rows.length} publications in pending status`],
        { actionEndpoint: 'GET /jobs/:jobId/publications' },
      ));
    }

    // Check for old pending (>24h)
    const now = Date.now();
    const oldPending = rows.filter((r) => {
      const created = new Date(r['created_at'] as string).getTime();
      return (now - created) > 24 * 60 * 60 * 1000;
    });

    if (oldPending.length > 0) {
      advisories.push(createAdvisory(
        tenantId,
        AdvisoryCategory.PUBLICATION_RISK,
        AdvisoryUrgency.HIGH,
        AdvisoryAudience.SUPPORT,
        `${oldPending.length} Publication(s) Pending >24h`,
        `${oldPending.length} publication(s) have been pending for more than 24 hours. ` +
        `These may require manual intervention or recovery action.`,
        'Investigate stuck publications and trigger recovery if needed',
        [AdvisorySource.PUBLICATION_STATE, AdvisorySource.RECOVERY_STATE],
        oldPending.map((p) => `Publication ${p['id']} pending since ${p['created_at']}`).slice(0, 5),
        { actionEndpoint: 'POST /recovery/stuck/repair' },
      ));
    }
  } catch { /* graceful */ }
}

async function checkCampaignState(
  tenantId: string,
  supabase: SupabaseClient,
  advisories: Advisory[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_campaigns', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'id,name,status,progress',
      limit: 50,
    });

    const active = rows.filter((r) => r['status'] === 'active' || r['status'] === 'in_progress');

    // Campaigns with low progress
    const lowProgress = active.filter((r) => ((r['progress'] as number) ?? 0) < 20);
    if (lowProgress.length > 0 && active.length > 0) {
      advisories.push(createAdvisory(
        tenantId,
        AdvisoryCategory.CAMPAIGN_OPTIMIZATION,
        AdvisoryUrgency.MEDIUM,
        AdvisoryAudience.TENANT,
        `${lowProgress.length} Campaign(s) With Low Progress`,
        `${lowProgress.length} active campaign(s) have less than 20% progress. ` +
        `Consider reviewing scheduling, cadence, or content strategy to accelerate execution.`,
        'Review campaign schedules and consider running a simulation for optimization',
        [AdvisorySource.CAMPAIGN_STATE],
        lowProgress.map((c) => `"${c['name']}" at ${c['progress'] ?? 0}%`).slice(0, 5),
        { actionEndpoint: 'POST /simulation/run', confidence: 60 },
      ));
    }

    // No active campaigns at all
    if (active.length === 0 && rows.length > 0) {
      advisories.push(createAdvisory(
        tenantId,
        AdvisoryCategory.STRATEGIC_INSIGHT,
        AdvisoryUrgency.LOW,
        AdvisoryAudience.TENANT,
        'No Active Campaigns',
        `All ${rows.length} campaign(s) are inactive. Consider activating a campaign to maintain audience engagement.`,
        'Create or activate a campaign',
        [AdvisorySource.CAMPAIGN_STATE],
        [`${rows.length} total campaigns, 0 active`],
        { actionEndpoint: 'POST /campaigns', confidence: 50 },
      ));
    }
  } catch { /* graceful */ }
}

async function checkBillingState(
  tenantId: string,
  supabase: SupabaseClient,
  advisories: Advisory[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_usage_counters', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'jobs_used,jobs_limit',
      limit: 1,
    });

    if (rows.length > 0) {
      const used = (rows[0]['jobs_used'] as number) ?? 0;
      const limit = (rows[0]['jobs_limit'] as number) ?? 999;
      const utilization = limit > 0 ? Math.round((used / limit) * 100) : 0;

      if (utilization >= 95) {
        advisories.push(createAdvisory(
          tenantId,
          AdvisoryCategory.BILLING_WARNING,
          AdvisoryUrgency.CRITICAL,
          AdvisoryAudience.ACCOUNT_OWNER,
          'Plan Limit Nearly Reached',
          `Usage is at ${utilization}% (${used}/${limit}). ` +
          `New jobs may be blocked. Upgrade your plan or wait for the next billing cycle.`,
          'Upgrade plan or optimize usage',
          [AdvisorySource.BILLING_STATE],
          [`${used}/${limit} jobs used (${utilization}%)`],
          { actionEndpoint: 'GET /billing/usage', confidence: 95 },
        ));
      } else if (utilization >= 80) {
        advisories.push(createAdvisory(
          tenantId,
          AdvisoryCategory.BILLING_WARNING,
          AdvisoryUrgency.MEDIUM,
          AdvisoryAudience.TENANT,
          'Approaching Plan Limit',
          `Usage is at ${utilization}% (${used}/${limit}). ` +
          `Consider monitoring usage or upgrading if you expect more activity.`,
          'Monitor usage or consider plan upgrade',
          [AdvisorySource.BILLING_STATE],
          [`${used}/${limit} jobs used (${utilization}%)`],
          { actionEndpoint: 'GET /billing/usage', confidence: 90 },
        ));
      }
    }
  } catch { /* graceful */ }
}

async function checkGovernanceState(
  tenantId: string,
  supabase: SupabaseClient,
  advisories: Advisory[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_governance_decisions', {
      filters: [
        { column: 'tenant_id', operator: 'eq', value: tenantId },
        { column: 'decision_result', operator: 'eq', value: 'checkpoint_required' },
      ],
      select: 'id,gate_type,created_at',
      limit: 20,
    });

    if (rows.length >= 3) {
      advisories.push(createAdvisory(
        tenantId,
        AdvisoryCategory.GOVERNANCE_ESCALATION,
        AdvisoryUrgency.HIGH,
        AdvisoryAudience.ACCOUNT_OWNER,
        `${rows.length} Governance Checkpoint(s) Pending`,
        `${rows.length} governance checkpoint(s) are awaiting human review. ` +
        `Unresolved checkpoints block campaign execution.`,
        'Review and resolve governance checkpoints',
        [AdvisorySource.GOVERNANCE_STATE],
        rows.map((r) => `Checkpoint ${r['id']}: gate=${r['gate_type']}`).slice(0, 5),
        { actionEndpoint: 'GET /governance/checkpoints/pending' },
      ));
    }
  } catch { /* graceful */ }
}

async function checkRecoveryState(
  tenantId: string,
  supabase: SupabaseClient,
  advisories: Advisory[],
): Promise<void> {
  try {
    // Check recent failures
    const rows = await supabase.select<Record<string, unknown>>('bookagent_recovery_log', {
      filters: [
        { column: 'tenant_id', operator: 'eq', value: tenantId },
        { column: 'result', operator: 'eq', value: 'failed' },
      ],
      select: 'id,failure_class,entity_type,entity_id',
      limit: 20,
      orderBy: 'attempted_at',
      orderDesc: true,
    });

    if (rows.length >= 3) {
      advisories.push(createAdvisory(
        tenantId,
        AdvisoryCategory.RECOVERY_RECOMMENDATION,
        AdvisoryUrgency.HIGH,
        AdvisoryAudience.SUPPORT,
        `${rows.length} Failed Recovery Attempt(s)`,
        `${rows.length} recovery attempt(s) have failed recently. ` +
        `Manual investigation may be needed to resolve persistent failures.`,
        'Review recovery audit log and investigate root causes',
        [AdvisorySource.RECOVERY_STATE],
        rows.map((r) => `${r['failure_class']}: ${r['entity_type']}/${r['entity_id']}`).slice(0, 5),
        { actionEndpoint: 'GET /recovery/audit' },
      ));
    }
  } catch { /* graceful */ }
}

async function checkSimulationRecommendations(
  tenantId: string,
  supabase: SupabaseClient,
  advisories: Advisory[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_simulations', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'id,recommendations,summary',
      limit: 1,
      orderBy: 'created_at',
      orderDesc: true,
    });

    if (rows.length > 0) {
      let recs: Array<Record<string, unknown>> = [];
      try {
        const raw = rows[0]['recommendations'];
        recs = typeof raw === 'string' ? JSON.parse(raw) : (raw as Array<Record<string, unknown>>) ?? [];
      } catch { recs = []; }

      if (recs.length > 0) {
        const topRec = recs[0];
        advisories.push(createAdvisory(
          tenantId,
          AdvisoryCategory.PERFORMANCE_OPPORTUNITY,
          AdvisoryUrgency.LOW,
          AdvisoryAudience.TENANT,
          `Simulation Suggests: ${(topRec['title'] as string) ?? 'Optimization Available'}`,
          (topRec['description'] as string) ?? 'A recent simulation found optimization opportunities.',
          'Review simulation results and consider applying recommended changes',
          [AdvisorySource.SIMULATION],
          [`From simulation ${rows[0]['id']}`],
          { actionEndpoint: 'GET /simulation/recommendations', confidence: 55 },
        ));
      }
    }
  } catch { /* graceful */ }
}
