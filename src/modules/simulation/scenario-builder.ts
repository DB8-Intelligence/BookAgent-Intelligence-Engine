/**
 * Scenario Builder — Simulation & What-If Engine
 *
 * Constrói cenários de simulação: baseline (estado atual) e
 * alternativas (what-if). Lê dados do sistema para compor o
 * estado baseline e aplica mudanças propostas.
 *
 * Fontes de dados para baseline:
 *   - tenant memory (preferências aprendidas)
 *   - goal preferences (objetivo ativo)
 *   - campaigns (cadência e canais atuais)
 *   - knowledge graph (padrões relacionais)
 *
 * Parte 93: Simulation & What-If Engine
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  SimulationScenario,
  ScenarioVariable,
  WhatIfChange,
} from '../../domain/entities/simulation.js';
import { SimulationAxis } from '../../domain/entities/simulation.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Baseline Builder
// ---------------------------------------------------------------------------

/**
 * Builds the baseline scenario from the tenant's current state.
 */
export async function buildBaseline(
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<SimulationScenario> {
  const variables: ScenarioVariable[] = [];

  // Populate variables from system data
  if (supabase) {
    await populateChannelVariable(tenantId, supabase, variables);
    await populateCadenceVariable(tenantId, supabase, variables);
    await populateGoalVariable(tenantId, supabase, variables);
    await populateAutoPublishVariable(tenantId, supabase, variables);
    await populateAutonomyVariable(tenantId, supabase, variables);
  }

  // Fill remaining axes with defaults
  ensureDefaultVariables(variables);

  return {
    id: uuid(),
    name: 'Baseline (Current State)',
    description: 'Represents the tenant\'s current operational configuration',
    isBaseline: true,
    variables,
    changes: [],
    impacts: [],
    overallScore: 50,
    tradeoffs: [],
  };
}

/**
 * Builds an alternative scenario by applying what-if changes to the baseline.
 */
export function buildAlternative(
  baseline: SimulationScenario,
  changes: WhatIfChange[],
  name?: string,
  description?: string,
): SimulationScenario {
  // Clone baseline variables and apply changes
  const variables: ScenarioVariable[] = baseline.variables.map((v) => {
    const change = changes.find((c) => c.axis === v.axis);
    return {
      ...v,
      proposedValue: change ? change.toValue : null,
    };
  });

  return {
    id: uuid(),
    name: name ?? `Alternative: ${changes.map((c) => c.axis).join(' + ')}`,
    description: description ?? `What-if scenario with ${changes.length} change(s)`,
    isBaseline: false,
    variables,
    changes,
    impacts: [],
    overallScore: 0,
    tradeoffs: [],
  };
}

// ---------------------------------------------------------------------------
// Variable Populators
// ---------------------------------------------------------------------------

async function populateChannelVariable(
  tenantId: string,
  supabase: SupabaseClient,
  variables: ScenarioVariable[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_publications', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'platform',
      limit: 200,
    });

    // Count channels
    const channels: Record<string, number> = {};
    for (const row of rows) {
      const platform = (row['platform'] as string) ?? 'unknown';
      channels[platform] = (channels[platform] ?? 0) + 1;
    }

    const channelList = Object.keys(channels);
    const primaryChannel = channelList.length > 0
      ? channelList.sort((a, b) => (channels[b] ?? 0) - (channels[a] ?? 0))[0]
      : 'none';

    variables.push({
      axis: SimulationAxis.CHANNEL,
      label: 'Primary publication channel',
      currentValue: primaryChannel,
      proposedValue: null,
    });
  } catch {
    // Graceful degradation
  }
}

async function populateCadenceVariable(
  tenantId: string,
  supabase: SupabaseClient,
  variables: ScenarioVariable[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_campaign_schedules', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'cadence',
      limit: 10,
    });

    if (rows.length > 0) {
      let cadence: Record<string, unknown> = {};
      try {
        const raw = rows[0]['cadence'];
        cadence = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>) ?? {};
      } catch {
        cadence = {};
      }

      const maxPerDay = (cadence['maxPerDay'] as number) ?? 2;
      variables.push({
        axis: SimulationAxis.CADENCE,
        label: 'Publications per day',
        currentValue: maxPerDay,
        proposedValue: null,
      });
    }
  } catch {
    // Graceful degradation
  }
}

async function populateGoalVariable(
  tenantId: string,
  supabase: SupabaseClient,
  variables: ScenarioVariable[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_goal_preferences', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'objective',
      limit: 1,
      orderBy: 'created_at',
      orderDesc: true,
    });

    const objective = rows.length > 0
      ? (rows[0]['objective'] as string) ?? 'balanced'
      : 'balanced';

    variables.push({
      axis: SimulationAxis.GOAL_PRIORITY,
      label: 'Primary optimization objective',
      currentValue: objective,
      proposedValue: null,
    });
  } catch {
    // Graceful degradation
  }
}

async function populateAutoPublishVariable(
  tenantId: string,
  supabase: SupabaseClient,
  variables: ScenarioVariable[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_governance_decisions', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'autonomy_level',
      limit: 1,
      orderBy: 'created_at',
      orderDesc: true,
    });

    // Infer auto-publish from autonomy level
    const autonomy = rows.length > 0 ? (rows[0]['autonomy_level'] as string) ?? 'assisted' : 'assisted';
    const autoPublish = autonomy === 'autonomous' || autonomy === 'supervised_autonomous';

    variables.push({
      axis: SimulationAxis.AUTO_PUBLISH,
      label: 'Auto-publish enabled',
      currentValue: autoPublish,
      proposedValue: null,
    });
  } catch {
    // Graceful degradation
  }
}

async function populateAutonomyVariable(
  tenantId: string,
  supabase: SupabaseClient,
  variables: ScenarioVariable[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_governance_decisions', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'autonomy_level',
      limit: 1,
      orderBy: 'created_at',
      orderDesc: true,
    });

    const level = rows.length > 0
      ? (rows[0]['autonomy_level'] as string) ?? 'assisted'
      : 'assisted';

    variables.push({
      axis: SimulationAxis.AUTONOMY_LEVEL,
      label: 'Governance autonomy level',
      currentValue: level,
      proposedValue: null,
    });
  } catch {
    // Graceful degradation
  }
}

// ---------------------------------------------------------------------------
// Default Fillers
// ---------------------------------------------------------------------------

function ensureDefaultVariables(variables: ScenarioVariable[]): void {
  const existingAxes = new Set(variables.map((v) => v.axis));

  const defaults: ScenarioVariable[] = [
    { axis: SimulationAxis.CHANNEL, label: 'Primary publication channel', currentValue: 'none', proposedValue: null },
    { axis: SimulationAxis.OUTPUT_MIX, label: 'Output format mix', currentValue: 'default', proposedValue: null },
    { axis: SimulationAxis.PRESET_TEMPLATE, label: 'Preset / template', currentValue: 'default', proposedValue: null },
    { axis: SimulationAxis.CAMPAIGN_DURATION, label: 'Campaign duration (days)', currentValue: 30, proposedValue: null },
    { axis: SimulationAxis.VARIANT_COUNT, label: 'Variants per output', currentValue: 1, proposedValue: null },
    { axis: SimulationAxis.CADENCE, label: 'Publications per day', currentValue: 1, proposedValue: null },
    { axis: SimulationAxis.GOAL_PRIORITY, label: 'Primary optimization objective', currentValue: 'balanced', proposedValue: null },
    { axis: SimulationAxis.AUTO_PUBLISH, label: 'Auto-publish enabled', currentValue: false, proposedValue: null },
    { axis: SimulationAxis.AUTONOMY_LEVEL, label: 'Governance autonomy level', currentValue: 'assisted', proposedValue: null },
  ];

  for (const def of defaults) {
    if (!existingAxes.has(def.axis)) {
      variables.push(def);
    }
  }
}

// ---------------------------------------------------------------------------
// Parse Changes from Request
// ---------------------------------------------------------------------------

export interface RawChange {
  axis: string;
  toValue: string | number | boolean;
  rationale?: string;
}

/**
 * Parses and validates raw changes from the API request.
 */
export function parseChanges(
  raw: RawChange[],
  baseline: SimulationScenario,
): WhatIfChange[] {
  const validAxes = Object.values(SimulationAxis) as string[];
  const changes: WhatIfChange[] = [];

  for (const r of raw) {
    if (!validAxes.includes(r.axis)) continue;

    const axis = r.axis as SimulationAxis;
    const baseVar = baseline.variables.find((v) => v.axis === axis);
    const fromValue = baseVar?.currentValue ?? 'unknown';

    changes.push({
      axis,
      fromValue,
      toValue: r.toValue,
      rationale: r.rationale ?? `Change ${axis} from ${String(fromValue)} to ${String(r.toValue)}`,
    });
  }

  return changes;
}
