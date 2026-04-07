/**
 * Governance Engine — Human-in-the-Loop Governance
 *
 * Gerencia checkpoints, decisões, overrides e escalações.
 * Persiste estado de governança e fornece API para o controller.
 *
 * Fluxo:
 *   1. Executor chama evaluateGate() (via evaluator)
 *   2. Se requer checkpoint → createCheckpoint() + persist
 *   3. Humano decide (approve/reject/override) via controller
 *   4. resolveCheckpoint() atualiza estado
 *   5. Executor re-avalia e prossegue (ou bloqueia)
 *
 * Parte 88: Human-in-the-Loop Governance
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  HumanCheckpoint,
  GovernanceDecision,
  ManualOverride,
  EscalationRequest,
  GovernanceAuditEntry,
  GovernancePolicy,
  GovernanceEvaluation,
} from '../../domain/entities/governance.js';
import {
  GovernanceDecisionResult,
  GovernanceGateType,
  EscalationStatus,
  EscalationSeverity,
} from '../../domain/entities/governance.js';
import type { TenantContext } from '../../domain/entities/tenant.js';
import {
  buildPolicy,
  evaluateGate,
  createCheckpoint,
} from './governance-evaluator.js';
import type { GateContext } from './governance-evaluator.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const CHECKPOINTS_TABLE = 'bookagent_governance_decisions';

export async function saveCheckpoint(
  checkpoint: HumanCheckpoint,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  await supabase.upsert(CHECKPOINTS_TABLE, {
    id: checkpoint.id,
    tenant_id: checkpoint.tenantId,
    gate: checkpoint.gate,
    rule_id: checkpoint.ruleId,
    target_type: checkpoint.targetType,
    target_id: checkpoint.targetId,
    context: checkpoint.context,
    decision: checkpoint.decision,
    status: checkpoint.status,
    created_at: checkpoint.createdAt,
    expires_at: checkpoint.expiresAt,
  });
}

export async function listCheckpoints(
  tenantId: string,
  status: GovernanceDecisionResult | null,
  supabase: SupabaseClient | null,
): Promise<HumanCheckpoint[]> {
  if (!supabase) return [];

  const filters = [
    { column: 'tenant_id', operator: 'eq' as const, value: tenantId },
  ];
  if (status) {
    filters.push({ column: 'status', operator: 'eq' as const, value: status });
  }

  const rows = await supabase.select<Record<string, unknown>>(CHECKPOINTS_TABLE, {
    filters,
    orderBy: 'created_at',
    orderDesc: true,
  });

  return rows.map(mapRowToCheckpoint);
}

export async function getCheckpoint(
  checkpointId: string,
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<HumanCheckpoint | null> {
  if (!supabase) return null;

  const rows = await supabase.select<Record<string, unknown>>(CHECKPOINTS_TABLE, {
    filters: [
      { column: 'id', operator: 'eq', value: checkpointId },
      { column: 'tenant_id', operator: 'eq', value: tenantId },
    ],
    limit: 1,
  });

  if (rows.length === 0) return null;
  return mapRowToCheckpoint(rows[0]!);
}

// ---------------------------------------------------------------------------
// Gate Evaluation (full flow)
// ---------------------------------------------------------------------------

/**
 * Full governance evaluation flow:
 * evaluate → create checkpoint if needed → persist → return result
 */
export async function evaluateAndGate(
  tenantCtx: TenantContext,
  ctx: GateContext,
  supabase: SupabaseClient | null,
): Promise<GovernanceEvaluation> {
  const policy = buildPolicy(tenantCtx);
  const evaluation = evaluateGate(policy, ctx);

  if (evaluation.requiresCheckpoint) {
    const checkpoint = createCheckpoint(tenantCtx.tenantId, evaluation, ctx);
    await saveCheckpoint(checkpoint, supabase);
    evaluation.checkpointId = checkpoint.id;

    logger.info(
      `[GovernanceEngine] Checkpoint created: ${checkpoint.id} ` +
      `gate=${ctx.gate} tenant=${tenantCtx.tenantId}`,
    );
  }

  if (evaluation.requiresEscalation) {
    const escalation = createEscalation(tenantCtx.tenantId, evaluation, ctx);
    // Escalation is logged but not blocking — checkpoint handles blocking
    logger.warn(
      `[GovernanceEngine] Escalation created: ${escalation.id} ` +
      `severity=${escalation.severity} tenant=${tenantCtx.tenantId}`,
    );
  }

  return evaluation;
}

// ---------------------------------------------------------------------------
// Resolve Checkpoint
// ---------------------------------------------------------------------------

/**
 * Resolves a pending checkpoint with a human decision.
 */
export async function resolveCheckpoint(
  checkpointId: string,
  tenantId: string,
  decision: GovernanceDecision,
  supabase: SupabaseClient | null,
): Promise<HumanCheckpoint | null> {
  const checkpoint = await getCheckpoint(checkpointId, tenantId, supabase);
  if (!checkpoint) return null;

  if (checkpoint.status !== GovernanceDecisionResult.PENDING) {
    logger.warn(`[GovernanceEngine] Checkpoint ${checkpointId} already resolved: ${checkpoint.status}`);
    return checkpoint;
  }

  checkpoint.decision = decision;
  checkpoint.status = decision.result;

  await saveCheckpoint(checkpoint, supabase);

  // Record audit
  const audit = buildAuditEntry(checkpoint, decision);
  logger.info(
    `[GovernanceEngine] Checkpoint ${checkpointId} resolved: ${decision.result} ` +
    `by ${decision.decidedBy}`,
  );

  return checkpoint;
}

// ---------------------------------------------------------------------------
// Manual Override
// ---------------------------------------------------------------------------

/**
 * Creates a manual override for a checkpoint.
 */
export async function createOverride(
  checkpointId: string,
  tenantId: string,
  overriddenBy: string,
  justification: string,
  supabase: SupabaseClient | null,
): Promise<ManualOverride | null> {
  const checkpoint = await getCheckpoint(checkpointId, tenantId, supabase);
  if (!checkpoint) return null;

  const override: ManualOverride = {
    id: uuid(),
    checkpointId,
    tenantId,
    gate: checkpoint.gate,
    overriddenBy,
    justification,
    riskAcknowledged: true,
    createdAt: new Date().toISOString(),
  };

  // Resolve checkpoint as override
  const decision: GovernanceDecision = {
    result: GovernanceDecisionResult.OVERRIDE,
    decidedBy: overriddenBy,
    justification: `Override: ${justification}`,
    decidedAt: new Date().toISOString(),
  };

  await resolveCheckpoint(checkpointId, tenantId, decision, supabase);

  logger.warn(
    `[GovernanceEngine] Manual override created: ${override.id} ` +
    `checkpoint=${checkpointId} by=${overriddenBy}`,
  );

  return override;
}

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

function createEscalation(
  tenantId: string,
  evaluation: GovernanceEvaluation,
  ctx: GateContext,
): EscalationRequest {
  return {
    id: uuid(),
    tenantId,
    checkpointId: evaluation.checkpointId ?? '',
    severity: determineSeverity(ctx),
    status: EscalationStatus.OPEN,
    title: `Escalação: ${ctx.gate} para ${ctx.targetType}/${ctx.targetId}`,
    description: evaluation.reason,
    context: {
      gate: ctx.gate,
      targetType: ctx.targetType,
      targetId: ctx.targetId,
      ...ctx.extra,
    },
    escalatedTo: 'admin',
    resolution: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
}

function determineSeverity(ctx: GateContext): EscalationSeverity {
  if ((ctx.consecutiveFailures ?? 0) >= 5) return EscalationSeverity.CRITICAL;
  if ((ctx.billingUsagePercent ?? 0) > 95) return EscalationSeverity.HIGH;
  if ((ctx.consecutiveFailures ?? 0) >= 3) return EscalationSeverity.MEDIUM;
  return EscalationSeverity.LOW;
}

// ---------------------------------------------------------------------------
// Policy Access
// ---------------------------------------------------------------------------

/**
 * Gets the current governance policy for a tenant.
 */
export function getPolicy(tenantCtx: TenantContext): GovernancePolicy {
  return buildPolicy(tenantCtx);
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

function buildAuditEntry(
  checkpoint: HumanCheckpoint,
  decision: GovernanceDecision,
): GovernanceAuditEntry {
  return {
    id: uuid(),
    tenantId: checkpoint.tenantId,
    gate: checkpoint.gate,
    targetType: checkpoint.targetType,
    targetId: checkpoint.targetId,
    autonomyLevel: 'semi_autonomous' as GovernanceAuditEntry['autonomyLevel'],
    result: decision.result,
    wasOverride: decision.result === GovernanceDecisionResult.OVERRIDE,
    wasEscalated: decision.result === GovernanceDecisionResult.ESCALATED,
    decidedBy: decision.decidedBy,
    justification: decision.justification,
    timestamp: decision.decidedAt,
  };
}

// ---------------------------------------------------------------------------
// Row Mapper
// ---------------------------------------------------------------------------

function mapRowToCheckpoint(row: Record<string, unknown>): HumanCheckpoint {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    gate: row['gate'] as GovernanceGateType,
    ruleId: row['rule_id'] as string,
    targetType: row['target_type'] as string,
    targetId: row['target_id'] as string,
    context: (row['context'] ?? {}) as Record<string, unknown>,
    decision: (row['decision'] as GovernanceDecision) ?? null,
    status: row['status'] as GovernanceDecisionResult,
    createdAt: row['created_at'] as string,
    expiresAt: row['expires_at'] as string,
  };
}
