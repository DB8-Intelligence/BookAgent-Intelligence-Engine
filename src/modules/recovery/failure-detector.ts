/**
 * Failure Detector — Self-Healing Operations & Recovery
 *
 * Detecta estados inconsistentes, entidades stuck e falhas
 * pendentes de recovery no sistema.
 *
 * Scans:
 *   1. Stuck states — entidades em estado intermediário por tempo excessivo
 *   2. Inconsistencies — job completed sem artifact, pub success sem ref, etc.
 *   3. Orphans — estados parciais sem entidade pai
 *
 * Parte 91: Self-Healing Operations & Recovery
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  StuckStateSignal,
  ReconciliationTask,
} from '../../domain/entities/recovery.js';
import {
  StuckSeverity,
  ReconcileStatus,
  STUCK_THRESHOLD_MINUTES,
} from '../../domain/entities/recovery.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Stuck State Detection
// ---------------------------------------------------------------------------

/**
 * Scans for stuck states across the system.
 */
export async function detectStuckStates(
  tenantId: string | null,
  supabase: SupabaseClient | null,
): Promise<StuckStateSignal[]> {
  if (!supabase) return [];

  const signals: StuckStateSignal[] = [];
  const now = new Date();

  // 1. Stuck jobs — queued or processing too long
  const stuckJobs = await scanStuckJobs(tenantId, supabase, now);
  signals.push(...stuckJobs);

  // 2. Stuck publications — pending too long
  const stuckPubs = await scanStuckPublications(tenantId, supabase, now);
  signals.push(...stuckPubs);

  if (signals.length > 0) {
    logger.warn(
      `[FailureDetector] Detected ${signals.length} stuck states` +
      (tenantId ? ` for tenant=${tenantId}` : ' (global)'),
    );
  }

  return signals;
}

async function scanStuckJobs(
  tenantId: string | null,
  supabase: SupabaseClient,
  now: Date,
): Promise<StuckStateSignal[]> {
  const signals: StuckStateSignal[] = [];

  // Query jobs in intermediate states
  type Filter = { column: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'in'; value: string | number | boolean | null };
  const filters: Filter[] = [
    { column: 'approval_status', operator: 'in', value: '(queued,processing)' },
  ];
  if (tenantId) {
    filters.push({ column: 'tenant_id', operator: 'eq', value: tenantId });
  }

  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_job_meta', {
      filters,
      select: 'job_id,approval_status,tenant_id,created_at',
      limit: 100,
    });

    for (const row of rows) {
      const created = new Date(row['created_at'] as string);
      const minutesStuck = (now.getTime() - created.getTime()) / 60000;
      const state = row['approval_status'] as string;
      const threshold = STUCK_THRESHOLD_MINUTES[`job_${state}`] ?? 60;

      if (minutesStuck > threshold) {
        signals.push({
          id: uuid(),
          entityType: 'job',
          entityId: row['job_id'] as string,
          currentState: state,
          expectedState: 'completed',
          stuckMinutes: Math.round(minutesStuck),
          severity: minutesStuck > threshold * 3 ? StuckSeverity.CRITICAL
            : minutesStuck > threshold * 2 ? StuckSeverity.HIGH
            : StuckSeverity.MEDIUM,
          tenantId: (row['tenant_id'] as string) ?? 'unknown',
          detectedAt: now.toISOString(),
        });
      }
    }
  } catch {
    // Table may not exist yet — graceful degradation
  }

  return signals;
}

async function scanStuckPublications(
  tenantId: string | null,
  supabase: SupabaseClient,
  now: Date,
): Promise<StuckStateSignal[]> {
  const signals: StuckStateSignal[] = [];

  type Filter = { column: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'in'; value: string | number | boolean | null };
  const filters: Filter[] = [
    { column: 'status', operator: 'eq', value: 'pending' },
  ];
  if (tenantId) {
    filters.push({ column: 'tenant_id', operator: 'eq', value: tenantId });
  }

  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_publications', {
      filters,
      select: 'id,status,tenant_id,created_at',
      limit: 100,
    });

    const threshold = STUCK_THRESHOLD_MINUTES['publication_pending'] ?? 120;

    for (const row of rows) {
      const created = new Date(row['created_at'] as string);
      const minutesStuck = (now.getTime() - created.getTime()) / 60000;

      if (minutesStuck > threshold) {
        signals.push({
          id: uuid(),
          entityType: 'publication',
          entityId: row['id'] as string,
          currentState: 'pending',
          expectedState: 'published',
          stuckMinutes: Math.round(minutesStuck),
          severity: minutesStuck > threshold * 2 ? StuckSeverity.HIGH : StuckSeverity.MEDIUM,
          tenantId: (row['tenant_id'] as string) ?? 'unknown',
          detectedAt: now.toISOString(),
        });
      }
    }
  } catch {
    // Graceful degradation
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Inconsistency Detection (Reconciliation)
// ---------------------------------------------------------------------------

/**
 * Runs a reconciliation scan for a specific scope.
 */
export async function runReconciliation(
  scope: ReconciliationTask['scope'],
  tenantId: string | null,
  supabase: SupabaseClient | null,
): Promise<ReconciliationTask> {
  const task: ReconciliationTask = {
    id: uuid(),
    scope,
    status: ReconcileStatus.RUNNING,
    tenantId,
    issuesFound: 0,
    issuesFixed: 0,
    issues: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  if (!supabase) {
    task.status = ReconcileStatus.COMPLETED;
    task.completedAt = new Date().toISOString();
    return task;
  }

  try {
    switch (scope) {
      case 'jobs':
        await reconcileJobs(task, tenantId, supabase);
        break;
      case 'publications':
        await reconcilePublications(task, tenantId, supabase);
        break;
      case 'billing':
        await reconcileBilling(task, tenantId, supabase);
        break;
      case 'artifacts':
        await reconcileArtifacts(task, tenantId, supabase);
        break;
      case 'schedules':
        await reconcileSchedules(task, tenantId, supabase);
        break;
    }

    task.status = task.issuesFound > task.issuesFixed
      ? ReconcileStatus.COMPLETED_WITH_ISSUES
      : ReconcileStatus.COMPLETED;
  } catch (err) {
    task.status = ReconcileStatus.FAILED;
    logger.error(`[FailureDetector] Reconciliation ${scope} failed: ${err}`);
  }

  task.completedAt = new Date().toISOString();

  logger.info(
    `[FailureDetector] Reconciliation ${scope}: found=${task.issuesFound} fixed=${task.issuesFixed}`,
  );

  return task;
}

// ---------------------------------------------------------------------------
// Scope-specific Reconcilers
// ---------------------------------------------------------------------------

async function reconcileJobs(
  task: ReconciliationTask,
  tenantId: string | null,
  supabase: SupabaseClient,
): Promise<void> {
  // Check: completed jobs without artifacts
  type Filter = { column: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'in'; value: string | number | boolean | null };
  const filters: Filter[] = [
    { column: 'approval_status', operator: 'eq', value: 'final_approved' },
  ];
  if (tenantId) {
    filters.push({ column: 'tenant_id', operator: 'eq', value: tenantId });
  }

  try {
    const jobs = await supabase.select<Record<string, unknown>>('bookagent_job_meta', {
      filters,
      select: 'job_id,tenant_id',
      limit: 200,
    });

    for (const job of jobs) {
      const jobId = job['job_id'] as string;

      // Check if artifacts exist
      try {
        const artifacts = await supabase.select<Record<string, unknown>>('bookagent_job_artifacts', {
          filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
          limit: 1,
        });

        if (artifacts.length === 0) {
          task.issuesFound++;
          task.issues.push({
            entityType: 'job',
            entityId: jobId,
            issue: 'Job marked completed but has no artifacts',
            fixed: false,
            action: 'Flag for manual review',
          });
        }
      } catch {
        // Table may not exist
      }
    }
  } catch {
    // Graceful degradation
  }
}

async function reconcilePublications(
  task: ReconciliationTask,
  tenantId: string | null,
  supabase: SupabaseClient,
): Promise<void> {
  // Check: published status without external reference
  type Filter = { column: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'in'; value: string | number | boolean | null };
  const filters: Filter[] = [
    { column: 'status', operator: 'eq', value: 'published' },
  ];
  if (tenantId) {
    filters.push({ column: 'tenant_id', operator: 'eq', value: tenantId });
  }

  try {
    const pubs = await supabase.select<Record<string, unknown>>('bookagent_publications', {
      filters,
      select: 'id,tenant_id,external_id',
      limit: 200,
    });

    for (const pub of pubs) {
      if (!pub['external_id']) {
        task.issuesFound++;
        task.issues.push({
          entityType: 'publication',
          entityId: pub['id'] as string,
          issue: 'Publication marked published but has no external reference',
          fixed: false,
          action: 'Flag for manual verification',
        });
      }
    }
  } catch {
    // Graceful degradation
  }
}

async function reconcileBilling(
  task: ReconciliationTask,
  _tenantId: string | null,
  _supabase: SupabaseClient,
): Promise<void> {
  // Billing reconciliation would check counters vs actual records
  // V1: placeholder — real implementation compares usage_counters with job counts
  logger.debug('[FailureDetector] Billing reconciliation: V1 placeholder');
}

async function reconcileArtifacts(
  task: ReconciliationTask,
  _tenantId: string | null,
  _supabase: SupabaseClient,
): Promise<void> {
  // Artifact reconciliation would verify files exist on storage
  // V1: placeholder
  logger.debug('[FailureDetector] Artifact reconciliation: V1 placeholder');
}

async function reconcileSchedules(
  task: ReconciliationTask,
  _tenantId: string | null,
  _supabase: SupabaseClient,
): Promise<void> {
  // Schedule reconciliation would check schedule vs campaign item states
  // V1: placeholder
  logger.debug('[FailureDetector] Schedule reconciliation: V1 placeholder');
}
