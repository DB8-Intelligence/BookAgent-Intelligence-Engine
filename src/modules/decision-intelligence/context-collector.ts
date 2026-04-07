/**
 * Context Collector — Decision Intelligence Layer
 *
 * Coleta inputs de todos os módulos relevantes e monta o
 * DecisionContext que alimenta a engine decisória.
 *
 * Fontes:
 *   - Analytics (publicações, jobs, engagement)
 *   - Learning rules (regras ativas)
 *   - Tenant memory (preferências aprendidas)
 *   - Knowledge graph (relações fortes)
 *   - Simulation (recomendações recentes)
 *   - Goal optimization (objetivo ativo + params)
 *   - Governance (autonomy level)
 *   - Billing (usage counters)
 *   - Campaign / schedule / execution state
 *
 * Parte 94: Decision Intelligence Layer
 */

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  DecisionContext,
  DecisionInput,
  DecisionConstraint,
  DecisionConflict,
} from '../../domain/entities/decision.js';
import {
  DecisionInputSource,
  ConflictSeverity,
} from '../../domain/entities/decision.js';

// ---------------------------------------------------------------------------
// Main Collector
// ---------------------------------------------------------------------------

/**
 * Collects a full decision context for a tenant.
 */
export async function collectContext(
  tenantId: string | null,
  supabase: SupabaseClient | null,
): Promise<DecisionContext> {
  const inputs: DecisionInput[] = [];
  const constraints: DecisionConstraint[] = [];

  if (supabase && tenantId) {
    await collectGoalInputs(tenantId, supabase, inputs);
    await collectGovernanceInputs(tenantId, supabase, inputs, constraints);
    await collectCampaignInputs(tenantId, supabase, inputs);
    await collectScheduleInputs(tenantId, supabase, inputs);
    await collectMemoryInputs(tenantId, supabase, inputs);
    await collectGraphInputs(tenantId, supabase, inputs);
    await collectSimulationInputs(tenantId, supabase, inputs);
    await collectBillingInputs(tenantId, supabase, inputs, constraints);
    await collectAnalyticsInputs(tenantId, supabase, inputs);
  }

  // Detect conflicts between inputs
  const conflicts = detectConflicts(inputs);

  return {
    tenantId,
    inputs,
    constraints,
    conflicts,
    capturedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Per-Source Collectors
// ---------------------------------------------------------------------------

async function collectGoalInputs(
  tenantId: string,
  supabase: SupabaseClient,
  inputs: DecisionInput[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_goal_preferences', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'objective,aggressiveness',
      limit: 1,
      orderBy: 'created_at',
      orderDesc: true,
    });
    if (rows.length > 0) {
      inputs.push({
        source: DecisionInputSource.GOAL_OPTIMIZATION,
        signal: 'active_objective',
        value: (rows[0]['objective'] as string) ?? 'balanced',
        weight: 80,
      });
      inputs.push({
        source: DecisionInputSource.GOAL_OPTIMIZATION,
        signal: 'aggressiveness',
        value: (rows[0]['aggressiveness'] as string) ?? 'moderate',
        weight: 60,
      });
    }
  } catch { /* graceful */ }
}

async function collectGovernanceInputs(
  tenantId: string,
  supabase: SupabaseClient,
  inputs: DecisionInput[],
  constraints: DecisionConstraint[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_governance_decisions', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'autonomy_level,gate_type,decision_result',
      limit: 5,
      orderBy: 'created_at',
      orderDesc: true,
    });

    if (rows.length > 0) {
      const level = (rows[0]['autonomy_level'] as string) ?? 'assisted';
      inputs.push({
        source: DecisionInputSource.GOVERNANCE_POLICY,
        signal: 'autonomy_level',
        value: level,
        weight: 90,
      });

      // Low autonomy = constraint on auto-execution
      if (level === 'manual' || level === 'assisted') {
        constraints.push({
          source: DecisionInputSource.GOVERNANCE_POLICY,
          description: `Autonomy level "${level}" requires human checkpoints`,
          blocked: 'auto_execute',
          hard: true,
        });
      }
    }
  } catch { /* graceful */ }
}

async function collectCampaignInputs(
  tenantId: string,
  supabase: SupabaseClient,
  inputs: DecisionInput[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_campaigns', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'id,status,progress',
      limit: 20,
    });

    const active = rows.filter((r) => r['status'] === 'active' || r['status'] === 'in_progress');
    const total = rows.length;

    inputs.push({
      source: DecisionInputSource.CAMPAIGN_STATE,
      signal: 'active_campaigns',
      value: active.length,
      weight: 70,
    });
    inputs.push({
      source: DecisionInputSource.CAMPAIGN_STATE,
      signal: 'total_campaigns',
      value: total,
      weight: 40,
    });

    if (active.length > 0) {
      const avgProgress = active.reduce((s, r) => s + ((r['progress'] as number) ?? 0), 0) / active.length;
      inputs.push({
        source: DecisionInputSource.CAMPAIGN_STATE,
        signal: 'avg_campaign_progress',
        value: Math.round(avgProgress),
        weight: 50,
      });
    }
  } catch { /* graceful */ }
}

async function collectScheduleInputs(
  tenantId: string,
  supabase: SupabaseClient,
  inputs: DecisionInput[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_campaign_schedules', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'id,status',
      limit: 10,
      orderBy: 'created_at',
      orderDesc: true,
    });

    const activeSchedules = rows.filter((r) => r['status'] === 'active' || r['status'] === 'in_progress');
    inputs.push({
      source: DecisionInputSource.SCHEDULE_STATE,
      signal: 'active_schedules',
      value: activeSchedules.length,
      weight: 60,
    });
  } catch { /* graceful */ }
}

async function collectMemoryInputs(
  tenantId: string,
  supabase: SupabaseClient,
  inputs: DecisionInput[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_tenant_memory', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'id,patterns',
      limit: 5,
    });

    let patternCount = 0;
    for (const row of rows) {
      try {
        const raw = row['patterns'];
        const pats = typeof raw === 'string' ? JSON.parse(raw) : (raw as unknown[]) ?? [];
        patternCount += pats.length;
      } catch { /* skip */ }
    }

    inputs.push({
      source: DecisionInputSource.TENANT_MEMORY,
      signal: 'memory_patterns',
      value: patternCount,
      weight: 55,
    });
  } catch { /* graceful */ }
}

async function collectGraphInputs(
  tenantId: string,
  supabase: SupabaseClient,
  inputs: DecisionInput[],
): Promise<void> {
  try {
    const edges = await supabase.select<Record<string, unknown>>('bookagent_knowledge_edges', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'weight',
      limit: 100,
    });

    if (edges.length > 0) {
      const avgWeight = edges.reduce((s, e) => s + ((e['weight'] as number) ?? 0), 0) / edges.length;
      inputs.push({
        source: DecisionInputSource.KNOWLEDGE_GRAPH,
        signal: 'graph_edges',
        value: edges.length,
        weight: 45,
      });
      inputs.push({
        source: DecisionInputSource.KNOWLEDGE_GRAPH,
        signal: 'avg_edge_weight',
        value: Math.round(avgWeight),
        weight: 40,
      });
    }
  } catch { /* graceful */ }
}

async function collectSimulationInputs(
  tenantId: string,
  supabase: SupabaseClient,
  inputs: DecisionInput[],
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
      let recCount = 0;
      try {
        const raw = rows[0]['recommendations'];
        const recs = typeof raw === 'string' ? JSON.parse(raw) : (raw as unknown[]) ?? [];
        recCount = recs.length;
      } catch { /* skip */ }

      inputs.push({
        source: DecisionInputSource.SIMULATION,
        signal: 'latest_simulation_recs',
        value: recCount,
        weight: 50,
      });
    }
  } catch { /* graceful */ }
}

async function collectBillingInputs(
  tenantId: string,
  supabase: SupabaseClient,
  inputs: DecisionInput[],
  constraints: DecisionConstraint[],
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

      inputs.push({
        source: DecisionInputSource.BILLING_LIMITS,
        signal: 'usage_utilization',
        value: utilization,
        weight: 70,
      });

      if (utilization >= 90) {
        constraints.push({
          source: DecisionInputSource.BILLING_LIMITS,
          description: `Usage at ${utilization}% of plan limit`,
          blocked: 'new_jobs',
          hard: utilization >= 100,
        });
      }
    }
  } catch { /* graceful */ }
}

async function collectAnalyticsInputs(
  tenantId: string,
  supabase: SupabaseClient,
  inputs: DecisionInput[],
): Promise<void> {
  try {
    const pubs = await supabase.select<Record<string, unknown>>('bookagent_publications', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'id,status',
      limit: 100,
    });

    const published = pubs.filter((p) => p['status'] === 'published');
    inputs.push({
      source: DecisionInputSource.ANALYTICS,
      signal: 'total_publications',
      value: pubs.length,
      weight: 50,
    });
    inputs.push({
      source: DecisionInputSource.ANALYTICS,
      signal: 'published_count',
      value: published.length,
      weight: 55,
    });
  } catch { /* graceful */ }
}

// ---------------------------------------------------------------------------
// Conflict Detection
// ---------------------------------------------------------------------------

function detectConflicts(inputs: DecisionInput[]): DecisionConflict[] {
  const conflicts: DecisionConflict[] = [];

  // Goal vs Billing conflict
  const goalObj = inputs.find((i) => i.source === DecisionInputSource.GOAL_OPTIMIZATION && i.signal === 'active_objective');
  const utilization = inputs.find((i) => i.source === DecisionInputSource.BILLING_LIMITS && i.signal === 'usage_utilization');

  if (goalObj && utilization) {
    const goalValue = String(goalObj.value);
    const usagePct = Number(utilization.value);

    if ((goalValue === 'high_quality' || goalValue === 'awareness') && usagePct >= 80) {
      conflicts.push({
        sourceA: DecisionInputSource.GOAL_OPTIMIZATION,
        sourceB: DecisionInputSource.BILLING_LIMITS,
        description: `Goal "${goalValue}" requires high output volume but usage is at ${usagePct}%`,
        severity: usagePct >= 95 ? ConflictSeverity.BLOCKING : ConflictSeverity.HIGH,
        resolution: usagePct >= 95
          ? 'Escalate: billing limit blocks goal execution'
          : 'Prioritize efficiency — fewer but higher-impact outputs',
      });
    }
  }

  // Autonomy vs active campaigns conflict
  const autonomy = inputs.find((i) => i.source === DecisionInputSource.GOVERNANCE_POLICY && i.signal === 'autonomy_level');
  const activeCampaigns = inputs.find((i) => i.source === DecisionInputSource.CAMPAIGN_STATE && i.signal === 'active_campaigns');

  if (autonomy && activeCampaigns) {
    const level = String(autonomy.value);
    const campaignCount = Number(activeCampaigns.value);

    if ((level === 'manual' || level === 'assisted') && campaignCount > 5) {
      conflicts.push({
        sourceA: DecisionInputSource.GOVERNANCE_POLICY,
        sourceB: DecisionInputSource.CAMPAIGN_STATE,
        description: `Low autonomy "${level}" with ${campaignCount} active campaigns creates bottleneck`,
        severity: ConflictSeverity.MEDIUM,
        resolution: 'Consider raising autonomy level or reducing active campaigns',
      });
    }
  }

  return conflicts;
}
