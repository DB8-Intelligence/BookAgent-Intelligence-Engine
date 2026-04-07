/**
 * Schedule Manager — Scheduling & Calendar Orchestration
 *
 * Gerencia o ciclo de vida do schedule:
 *   - Persistência (save, list, get)
 *   - Transições de status de schedule items
 *   - Replanejamento (replan) quando itens atrasam
 *   - Confirmação e execução de itens
 *   - Avaliação de dependências
 *
 * Parte 86: Scheduling & Calendar Orchestration
 */

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  CampaignSchedule,
  ScheduleItem,
  ScheduleAdjustment,
} from '../../domain/entities/schedule.js';
import {
  ScheduleItemStatus,
  CampaignScheduleStatus,
  AdjustmentReason,
} from '../../domain/entities/schedule.js';
import { computeCounts } from './schedule-generator.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const TABLE = 'bookagent_campaign_schedules';

/**
 * Persists a schedule to Supabase.
 */
export async function saveSchedule(
  schedule: CampaignSchedule,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  await supabase.upsert(TABLE, {
    id: schedule.id,
    campaign_id: schedule.campaignId,
    tenant_id: schedule.tenantId,
    status: schedule.status,
    cadence: schedule.cadence,
    items: schedule.items,
    adjustments: schedule.adjustments,
    starts_at: schedule.startsAt,
    estimated_end_at: schedule.estimatedEndAt,
    counts: schedule.counts,
    progress_percent: schedule.progressPercent,
    created_at: schedule.createdAt,
    updated_at: schedule.updatedAt,
  });
}

/**
 * Lists schedules for a tenant.
 */
export async function listSchedules(
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<CampaignSchedule[]> {
  if (!supabase) return [];

  const rows = await supabase.select<Record<string, unknown>>(TABLE, {
    filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
    orderBy: 'created_at',
    orderDesc: true,
  });

  return rows.map(mapRowToSchedule);
}

/**
 * Gets a schedule by campaign ID (tenant-scoped).
 */
export async function getScheduleByCampaign(
  campaignId: string,
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<CampaignSchedule | null> {
  if (!supabase) return null;

  const rows = await supabase.select<Record<string, unknown>>(TABLE, {
    filters: [
      { column: 'campaign_id', operator: 'eq', value: campaignId },
      { column: 'tenant_id', operator: 'eq', value: tenantId },
    ],
    limit: 1,
  });

  if (rows.length === 0) return null;
  return mapRowToSchedule(rows[0]!);
}

// ---------------------------------------------------------------------------
// Item Status Transitions
// ---------------------------------------------------------------------------

/**
 * Confirms a schedule item — user accepts the planned date.
 */
export function confirmItem(
  schedule: CampaignSchedule,
  scheduleItemId: string,
): boolean {
  const item = schedule.items.find((i) => i.id === scheduleItemId);
  if (!item) return false;

  if (item.status !== ScheduleItemStatus.PLANNED &&
      item.status !== ScheduleItemStatus.READY_TO_EXECUTE) {
    return false;
  }

  item.status = ScheduleItemStatus.CONFIRMED;
  item.confirmedAt = new Date().toISOString();
  refreshSchedule(schedule);
  return true;
}

/**
 * Marks a schedule item as executed (published).
 */
export function markExecuted(
  schedule: CampaignSchedule,
  scheduleItemId: string,
): boolean {
  const item = schedule.items.find((i) => i.id === scheduleItemId);
  if (!item) return false;

  item.status = ScheduleItemStatus.EXECUTED;
  item.executedAt = new Date().toISOString();

  // Unblock dependents
  unblockDependents(schedule, item.campaignItemId);
  refreshSchedule(schedule);
  return true;
}

/**
 * Marks a schedule item as failed.
 */
export function markFailed(
  schedule: CampaignSchedule,
  scheduleItemId: string,
): boolean {
  const item = schedule.items.find((i) => i.id === scheduleItemId);
  if (!item) return false;

  item.status = ScheduleItemStatus.FAILED;
  refreshSchedule(schedule);
  return true;
}

/**
 * Skips a schedule item.
 */
export function skipItem(
  schedule: CampaignSchedule,
  scheduleItemId: string,
): boolean {
  const item = schedule.items.find((i) => i.id === scheduleItemId);
  if (!item) return false;

  item.status = ScheduleItemStatus.SKIPPED;
  unblockDependents(schedule, item.campaignItemId);
  refreshSchedule(schedule);
  return true;
}

// ---------------------------------------------------------------------------
// Dependency Resolution
// ---------------------------------------------------------------------------

/**
 * Unblocks items that depend on a completed/skipped item.
 */
function unblockDependents(schedule: CampaignSchedule, completedCampaignItemId: string): void {
  for (const item of schedule.items) {
    if (item.status !== ScheduleItemStatus.WAITING_DEPENDENCY) continue;

    const hasDep = item.dependencies.some(
      (d) => d.dependsOnItemId === completedCampaignItemId,
    );
    if (!hasDep) continue;

    // Check if ALL dependencies are satisfied
    const allSatisfied = item.dependencies.every((dep) => {
      const depItem = schedule.items.find(
        (si) => si.campaignItemId === dep.dependsOnItemId,
      );
      return depItem &&
        (depItem.status === ScheduleItemStatus.EXECUTED ||
         depItem.status === ScheduleItemStatus.SKIPPED);
    });

    if (allSatisfied) {
      item.status = item.requiresApproval
        ? ScheduleItemStatus.WAITING_APPROVAL
        : ScheduleItemStatus.READY_TO_EXECUTE;
    }
  }
}

/**
 * Evaluates all items and updates statuses based on dependencies and time.
 */
export function evaluateDependencies(schedule: CampaignSchedule): void {
  const now = new Date();

  for (const item of schedule.items) {
    // Check delayed
    if (
      item.status === ScheduleItemStatus.PLANNED ||
      item.status === ScheduleItemStatus.READY_TO_EXECUTE ||
      item.status === ScheduleItemStatus.CONFIRMED
    ) {
      if (new Date(item.window.latestAt) < now) {
        item.status = ScheduleItemStatus.DELAYED;
        continue;
      }
    }

    // Check if waiting deps are now satisfied
    if (item.status === ScheduleItemStatus.WAITING_DEPENDENCY) {
      const allSatisfied = item.dependencies.every((dep) => {
        const depItem = schedule.items.find(
          (si) => si.campaignItemId === dep.dependsOnItemId,
        );
        return depItem &&
          (depItem.status === ScheduleItemStatus.EXECUTED ||
           depItem.status === ScheduleItemStatus.SKIPPED);
      });

      if (allSatisfied) {
        item.status = item.requiresApproval
          ? ScheduleItemStatus.WAITING_APPROVAL
          : ScheduleItemStatus.READY_TO_EXECUTE;
      }
    }

    // Check if planned items within window are ready
    if (item.status === ScheduleItemStatus.PLANNED) {
      if (new Date(item.window.earliestAt) <= now && item.dependencies.length === 0) {
        item.status = item.requiresApproval
          ? ScheduleItemStatus.WAITING_APPROVAL
          : ScheduleItemStatus.READY_TO_EXECUTE;
      }
    }
  }

  refreshSchedule(schedule);
}

// ---------------------------------------------------------------------------
// Replanning
// ---------------------------------------------------------------------------

/**
 * Replans a schedule — pushes delayed items forward by a number of days.
 */
export function replanSchedule(
  schedule: CampaignSchedule,
  shiftDays: number,
  reason: AdjustmentReason,
  description: string,
): void {
  const shiftMs = shiftDays * 86400000;
  const now = new Date().toISOString();

  for (const item of schedule.items) {
    // Only replan non-terminal items
    if (
      item.status === ScheduleItemStatus.EXECUTED ||
      item.status === ScheduleItemStatus.SKIPPED ||
      item.status === ScheduleItemStatus.FAILED
    ) {
      continue;
    }

    const previousPlanned = item.window.plannedAt;

    // Shift all window dates
    item.window.earliestAt = new Date(new Date(item.window.earliestAt).getTime() + shiftMs).toISOString();
    item.window.plannedAt = new Date(new Date(item.window.plannedAt).getTime() + shiftMs).toISOString();
    item.window.latestAt = new Date(new Date(item.window.latestAt).getTime() + shiftMs).toISOString();

    // Clear confirmation if date moved
    if (item.confirmedAt) {
      item.confirmedAt = null;
      item.status = ScheduleItemStatus.PLANNED;
    }

    // If was delayed, back to planned
    if (item.status === ScheduleItemStatus.DELAYED) {
      item.status = ScheduleItemStatus.PLANNED;
    }

    // Record adjustment
    const adjustment: ScheduleAdjustment = {
      scheduleItemId: item.id,
      reason,
      previousPlannedAt: previousPlanned,
      newPlannedAt: item.window.plannedAt,
      description,
      adjustedAt: now,
    };
    schedule.adjustments.push(adjustment);
  }

  // Recompute end date
  const lastItem = schedule.items
    .filter((i) => i.status !== ScheduleItemStatus.SKIPPED)
    .sort((a, b) => b.window.plannedAt.localeCompare(a.window.plannedAt))[0];

  if (lastItem) {
    schedule.estimatedEndAt = new Date(
      new Date(lastItem.window.latestAt).getTime() + 86400000,
    ).toISOString();
  }

  refreshSchedule(schedule);

  logger.info(
    `[ScheduleManager] Replanned schedule=${schedule.id} ` +
    `by ${shiftDays} days, reason=${reason}`,
  );
}

/**
 * Replans a single item — shifts it forward.
 */
export function replanItem(
  schedule: CampaignSchedule,
  scheduleItemId: string,
  newPlannedAt: string,
  reason: AdjustmentReason,
  description: string,
): boolean {
  const item = schedule.items.find((i) => i.id === scheduleItemId);
  if (!item) return false;

  const previousPlanned = item.window.plannedAt;
  const newDate = new Date(newPlannedAt);

  item.window.plannedAt = newDate.toISOString();
  item.window.earliestAt = new Date(newDate.getTime() - 12 * 3600000).toISOString();
  item.window.latestAt = new Date(newDate.getTime() + 24 * 3600000).toISOString();

  if (item.status === ScheduleItemStatus.DELAYED) {
    item.status = ScheduleItemStatus.PLANNED;
  }
  if (item.confirmedAt) {
    item.confirmedAt = null;
  }

  schedule.adjustments.push({
    scheduleItemId: item.id,
    reason,
    previousPlannedAt: previousPlanned,
    newPlannedAt: newDate.toISOString(),
    description,
    adjustedAt: new Date().toISOString(),
  });

  refreshSchedule(schedule);
  return true;
}

// ---------------------------------------------------------------------------
// Progress & Refresh
// ---------------------------------------------------------------------------

function refreshSchedule(schedule: CampaignSchedule): void {
  schedule.counts = computeCounts(schedule.items);
  const { total, executed } = schedule.counts;
  schedule.progressPercent = total > 0 ? Math.round((executed / total) * 100) : 0;
  schedule.updatedAt = new Date().toISOString();

  // Auto-transition schedule status
  if (executed === total && total > 0) {
    schedule.status = CampaignScheduleStatus.COMPLETED;
  }
}

// ---------------------------------------------------------------------------
// Row Mapper
// ---------------------------------------------------------------------------

function mapRowToSchedule(row: Record<string, unknown>): CampaignSchedule {
  return {
    id: row['id'] as string,
    campaignId: row['campaign_id'] as string,
    tenantId: row['tenant_id'] as string,
    status: row['status'] as CampaignScheduleStatus,
    cadence: row['cadence'] as CampaignSchedule['cadence'],
    items: (row['items'] ?? []) as CampaignSchedule['items'],
    adjustments: (row['adjustments'] ?? []) as CampaignSchedule['adjustments'],
    startsAt: row['starts_at'] as string,
    estimatedEndAt: row['estimated_end_at'] as string,
    counts: row['counts'] as CampaignSchedule['counts'],
    progressPercent: row['progress_percent'] as number,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}
