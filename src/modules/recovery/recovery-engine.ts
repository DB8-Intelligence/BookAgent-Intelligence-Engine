/**
 * Recovery Engine — Self-Healing Operations & Recovery
 *
 * Motor de recuperação: avalia falhas, decide ação, executa
 * recovery e registra auditoria.
 *
 * Fluxo:
 *   1. Recebe failure class + entity
 *   2. Consulta policy para a classe
 *   3. Decide ação (retry, requeue, reconcile, escalate)
 *   4. Executa ação
 *   5. Registra attempt + audit
 *
 * Parte 91: Self-Healing Operations & Recovery
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  RecoveryPolicy,
  RecoveryDecision,
  RecoveryAttempt,
  RecoveryAuditEntry,
  StuckStateSignal,
} from '../../domain/entities/recovery.js';
import {
  FailureClass,
  RecoveryActionType,
  RecoveryResult,
  DEFAULT_RECOVERY_POLICIES,
} from '../../domain/entities/recovery.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const LOG_TABLE = 'bookagent_recovery_log';

export async function saveRecoveryAttempt(
  attempt: RecoveryAttempt,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  await supabase.upsert(LOG_TABLE, {
    id: attempt.id,
    tenant_id: attempt.tenantId,
    failure_class: attempt.failureClass,
    entity_type: attempt.entityType,
    entity_id: attempt.entityId,
    action: attempt.action,
    attempt_number: attempt.attemptNumber,
    result: attempt.result,
    details: attempt.details,
    error: attempt.error,
    attempted_at: attempt.attemptedAt,
    duration_ms: attempt.durationMs,
  });
}

export async function listRecoveryAttempts(
  tenantId: string | null,
  supabase: SupabaseClient | null,
): Promise<RecoveryAttempt[]> {
  if (!supabase) return [];

  const filters = tenantId
    ? [{ column: 'tenant_id', operator: 'eq' as const, value: tenantId }]
    : [];

  const rows = await supabase.select<Record<string, unknown>>(LOG_TABLE, {
    filters,
    orderBy: 'attempted_at',
    orderDesc: true,
    limit: 100,
  });

  return rows.map(mapRowToAttempt);
}

export async function getAttemptCount(
  entityType: string,
  entityId: string,
  failureClass: FailureClass,
  supabase: SupabaseClient | null,
): Promise<number> {
  if (!supabase) return 0;

  try {
    const rows = await supabase.select<Record<string, unknown>>(LOG_TABLE, {
      filters: [
        { column: 'entity_type', operator: 'eq', value: entityType },
        { column: 'entity_id', operator: 'eq', value: entityId },
        { column: 'failure_class', operator: 'eq', value: failureClass },
      ],
    });
    return rows.length;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Policy Resolution
// ---------------------------------------------------------------------------

/**
 * Gets the recovery policy for a failure class.
 */
export function getPolicy(failureClass: FailureClass): RecoveryPolicy {
  const policy = DEFAULT_RECOVERY_POLICIES.find((p) => p.failureClass === failureClass);
  if (!policy) {
    // Fallback: generic policy
    return {
      failureClass,
      maxRetries: 2,
      backoffBaseSec: 60,
      backoffMultiplier: 2,
      actions: [RecoveryActionType.RETRY, RecoveryActionType.FREEZE_AND_ESCALATE],
      escalationThreshold: 2,
      autoRecoveryEnabled: true,
      description: 'Política genérica de recovery',
    };
  }
  return policy;
}

// ---------------------------------------------------------------------------
// Decision Making
// ---------------------------------------------------------------------------

/**
 * Decides what recovery action to take.
 */
export async function makeDecision(
  failureClass: FailureClass,
  entityType: string,
  entityId: string,
  supabase: SupabaseClient | null,
): Promise<RecoveryDecision> {
  const policy = getPolicy(failureClass);
  const attemptCount = await getAttemptCount(entityType, entityId, failureClass, supabase);
  const attemptNumber = attemptCount + 1;

  // Check if should escalate
  if (attemptNumber > policy.escalationThreshold || attemptNumber > policy.maxRetries) {
    return {
      failureClass,
      action: RecoveryActionType.FREEZE_AND_ESCALATE,
      attemptNumber,
      canAutoRecover: false,
      shouldEscalate: true,
      reason: `Limite de ${policy.maxRetries} tentativas atingido (${attemptCount} anteriores). Escalando.`,
      backoffDelaySec: 0,
    };
  }

  // Check if auto-recovery is enabled
  if (!policy.autoRecoveryEnabled) {
    return {
      failureClass,
      action: RecoveryActionType.FREEZE_AND_ESCALATE,
      attemptNumber,
      canAutoRecover: false,
      shouldEscalate: true,
      reason: 'Auto-recovery desabilitado para esta classe de falha.',
      backoffDelaySec: 0,
    };
  }

  // Select action based on attempt number
  const actionIndex = Math.min(attemptNumber - 1, policy.actions.length - 1);
  const action = policy.actions[actionIndex] ?? RecoveryActionType.FREEZE_AND_ESCALATE;

  // Calculate backoff
  const backoffDelaySec = policy.backoffBaseSec * Math.pow(policy.backoffMultiplier, attemptNumber - 1);

  return {
    failureClass,
    action,
    attemptNumber,
    canAutoRecover: true,
    shouldEscalate: false,
    reason: `Tentativa ${attemptNumber}/${policy.maxRetries}: ${action}`,
    backoffDelaySec: Math.round(backoffDelaySec),
  };
}

// ---------------------------------------------------------------------------
// Execute Recovery
// ---------------------------------------------------------------------------

/**
 * Executes a recovery action for a failed entity.
 */
export async function executeRecovery(
  failureClass: FailureClass,
  entityType: string,
  entityId: string,
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<RecoveryAttempt> {
  const startMs = Date.now();

  // 1. Make decision
  const decision = await makeDecision(failureClass, entityType, entityId, supabase);

  // 2. Execute action
  let result: RecoveryResult;
  let details: string;
  let error: string | null = null;

  try {
    if (decision.shouldEscalate) {
      result = RecoveryResult.ESCALATED;
      details = decision.reason;
    } else {
      // Execute the action
      const actionResult = await performAction(decision.action, entityType, entityId, supabase);
      result = actionResult.success ? RecoveryResult.SUCCESS : RecoveryResult.FAILED;
      details = actionResult.details;
      error = actionResult.error;
    }
  } catch (err) {
    result = RecoveryResult.FAILED;
    details = `Recovery action failed: ${decision.action}`;
    error = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Date.now() - startMs;

  // 3. Build attempt record
  const attempt: RecoveryAttempt = {
    id: uuid(),
    tenantId,
    failureClass,
    entityType,
    entityId,
    action: decision.action,
    attemptNumber: decision.attemptNumber,
    result,
    details,
    error,
    attemptedAt: new Date().toISOString(),
    durationMs,
  };

  // 4. Persist
  await saveRecoveryAttempt(attempt, supabase);

  logger.info(
    `[RecoveryEngine] ${failureClass} ${entityType}/${entityId}: ` +
    `action=${decision.action} result=${result} attempt=${decision.attemptNumber} ` +
    `duration=${durationMs}ms`,
  );

  return attempt;
}

// ---------------------------------------------------------------------------
// Action Execution
// ---------------------------------------------------------------------------

async function performAction(
  action: RecoveryActionType,
  entityType: string,
  entityId: string,
  _supabase: SupabaseClient | null,
): Promise<{ success: boolean; details: string; error: string | null }> {
  // V1: actions are recorded but actual side effects are minimal.
  // Real implementations would interact with queue, providers, etc.

  switch (action) {
    case RecoveryActionType.RETRY:
      return {
        success: true,
        details: `Retry agendado para ${entityType}/${entityId}`,
        error: null,
      };

    case RecoveryActionType.RETRY_ALT_PROVIDER:
      return {
        success: true,
        details: `Retry com provider alternativo agendado para ${entityType}/${entityId}`,
        error: null,
      };

    case RecoveryActionType.REQUEUE:
      return {
        success: true,
        details: `${entityType}/${entityId} reenfileirado`,
        error: null,
      };

    case RecoveryActionType.RESEND_WEBHOOK:
      return {
        success: true,
        details: `Webhook reenviado para ${entityType}/${entityId}`,
        error: null,
      };

    case RecoveryActionType.RESCHEDULE_PUBLICATION:
      return {
        success: true,
        details: `Publicação ${entityId} remarcada`,
        error: null,
      };

    case RecoveryActionType.REGENERATE_ARTIFACT:
      return {
        success: true,
        details: `Artifact de ${entityType}/${entityId} marcado para regeneração`,
        error: null,
      };

    case RecoveryActionType.RECONCILE_STATE:
      return {
        success: true,
        details: `Estado de ${entityType}/${entityId} reconciliado`,
        error: null,
      };

    case RecoveryActionType.CLEANUP_ORPHAN:
      return {
        success: true,
        details: `Estado órfão ${entityType}/${entityId} limpo`,
        error: null,
      };

    case RecoveryActionType.FREEZE_AND_ESCALATE:
      return {
        success: true,
        details: `${entityType}/${entityId} congelado e escalado para intervenção humana`,
        error: null,
      };

    case RecoveryActionType.MARK_IRRECOVERABLE:
      return {
        success: true,
        details: `${entityType}/${entityId} marcado como irrecuperável`,
        error: null,
      };

    default:
      return {
        success: false,
        details: `Ação desconhecida: ${action}`,
        error: 'Unknown action',
      };
  }
}

// ---------------------------------------------------------------------------
// Batch Recovery for Stuck States
// ---------------------------------------------------------------------------

/**
 * Processes a batch of stuck state signals — runs recovery for each.
 */
export async function recoverStuckStates(
  stuckSignals: StuckStateSignal[],
  supabase: SupabaseClient | null,
): Promise<RecoveryAttempt[]> {
  const attempts: RecoveryAttempt[] = [];

  for (const signal of stuckSignals) {
    const attempt = await executeRecovery(
      FailureClass.STUCK_STATE,
      signal.entityType,
      signal.entityId,
      signal.tenantId,
      supabase,
    );
    attempts.push(attempt);
  }

  return attempts;
}

// ---------------------------------------------------------------------------
// Build Audit Entry
// ---------------------------------------------------------------------------

export function buildAuditEntry(attempt: RecoveryAttempt): RecoveryAuditEntry {
  return {
    id: uuid(),
    tenantId: attempt.tenantId,
    failureClass: attempt.failureClass,
    entityType: attempt.entityType,
    entityId: attempt.entityId,
    action: attempt.action,
    result: attempt.result,
    escalated: attempt.result === RecoveryResult.ESCALATED,
    details: attempt.details,
    timestamp: attempt.attemptedAt,
  };
}

// ---------------------------------------------------------------------------
// Row Mapper
// ---------------------------------------------------------------------------

function mapRowToAttempt(row: Record<string, unknown>): RecoveryAttempt {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    failureClass: row['failure_class'] as FailureClass,
    entityType: row['entity_type'] as string,
    entityId: row['entity_id'] as string,
    action: row['action'] as RecoveryActionType,
    attemptNumber: row['attempt_number'] as number,
    result: row['result'] as RecoveryResult,
    details: row['details'] as string,
    error: (row['error'] as string) ?? null,
    attemptedAt: row['attempted_at'] as string,
    durationMs: row['duration_ms'] as number,
  };
}
