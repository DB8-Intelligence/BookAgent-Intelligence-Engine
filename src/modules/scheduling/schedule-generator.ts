/**
 * Schedule Generator — Scheduling & Calendar Orchestration
 *
 * Transforma uma ContentCampaign em CampaignSchedule com datas
 * concretas, janelas de execução, dependências e cadência.
 *
 * Fluxo:
 *   ContentCampaign + startDate + TenantContext → CampaignSchedule
 *
 * Regras:
 *   - Cada CampaignItem gera um ScheduleItem
 *   - dayOffset do scheduleHint é aplicado a partir de startDate
 *   - Cadência limita publicações por dia
 *   - Dependências do CampaignItem viram ScheduleDependency
 *   - Tenant sem autoPublish → requiresApproval = true
 *   - Weekday preference da cadência ajusta datas
 *
 * Parte 86: Scheduling & Calendar Orchestration
 */

import { v4 as uuid } from 'uuid';

import type {
  CampaignSchedule,
  ScheduleItem,
  ScheduleWindow,
  ScheduleDependency,
  ScheduleCadence,
  CalendarEventHint,
  CalendarOverview,
} from '../../domain/entities/schedule.js';
import {
  ScheduleItemStatus,
  CampaignScheduleStatus,
  DEFAULT_CADENCE,
} from '../../domain/entities/schedule.js';
import type { ContentCampaign, CampaignItem } from '../../domain/entities/campaign.js';
import { CampaignItemStatus } from '../../domain/entities/campaign.js';
import type { TenantContext } from '../../domain/entities/tenant.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Schedule Generation
// ---------------------------------------------------------------------------

/**
 * Generates a CampaignSchedule from a ContentCampaign.
 */
export function generateSchedule(
  campaign: ContentCampaign,
  startDate: string,
  tenantCtx: TenantContext,
  cadenceOverride?: Partial<ScheduleCadence>,
): CampaignSchedule {
  const cadence: ScheduleCadence = { ...DEFAULT_CADENCE, ...cadenceOverride };
  const start = new Date(startDate);
  const hasAutoPublish = tenantCtx.features.autoPublish;

  // Track publications per day to enforce maxPerDay
  const daySlotCount = new Map<string, number>();

  const scheduleItems: ScheduleItem[] = campaign.items
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item, idx) => {
      const plannedDate = resolvePlannedDate(
        start,
        item,
        cadence,
        daySlotCount,
      );
      const plannedISO = plannedDate.toISOString();
      const dayKey = plannedISO.slice(0, 10);

      // Track slot usage
      daySlotCount.set(dayKey, (daySlotCount.get(dayKey) ?? 0) + 1);

      // Build window (±1 day around planned)
      const window = buildWindow(plannedDate, item.scheduleHint.suggestedTime);

      // Build dependencies from campaign item dependsOn
      const dependencies = buildDependencies(item);

      // Determine initial status
      const status = dependencies.length > 0
        ? ScheduleItemStatus.WAITING_DEPENDENCY
        : ScheduleItemStatus.PLANNED;

      return {
        id: uuid(),
        campaignItemId: item.id,
        sequenceOrder: idx,
        status,
        window,
        confirmedAt: null,
        executedAt: null,
        dependencies,
        requiresApproval: !hasAutoPublish,
        autoPublish: hasAutoPublish,
        channel: item.channel,
        format: item.format,
        title: item.title,
      };
    });

  // Compute end date from last item
  const lastItem = scheduleItems[scheduleItems.length - 1];
  const estimatedEnd = lastItem
    ? new Date(new Date(lastItem.window.latestAt).getTime() + 86400000)
    : new Date(start.getTime() + campaign.plannedDurationDays * 86400000);

  const now = new Date().toISOString();

  const schedule: CampaignSchedule = {
    id: uuid(),
    campaignId: campaign.id,
    tenantId: campaign.tenantId,
    status: CampaignScheduleStatus.DRAFT,
    cadence,
    items: scheduleItems,
    adjustments: [],
    startsAt: start.toISOString(),
    estimatedEndAt: estimatedEnd.toISOString(),
    counts: computeCounts(scheduleItems),
    progressPercent: 0,
    createdAt: now,
    updatedAt: now,
  };

  logger.info(
    `[ScheduleGenerator] Generated schedule for campaign=${campaign.id}: ` +
    `${scheduleItems.length} items, start=${startDate}, ` +
    `end=${estimatedEnd.toISOString().slice(0, 10)}`,
  );

  return schedule;
}

// ---------------------------------------------------------------------------
// Date Resolution
// ---------------------------------------------------------------------------

function resolvePlannedDate(
  startDate: Date,
  item: CampaignItem,
  cadence: ScheduleCadence,
  daySlotCount: Map<string, number>,
): Date {
  // Base: startDate + dayOffset
  const baseDate = new Date(startDate);
  baseDate.setDate(baseDate.getDate() + item.scheduleHint.dayOffset);

  // Apply preferred time
  const time = item.scheduleHint.suggestedTime ?? cadence.preferredSlots[0]?.time ?? '10:00';
  const [hours, minutes] = time.split(':').map(Number);
  baseDate.setHours(hours ?? 10, minutes ?? 0, 0, 0);

  // Skip weekends if configured
  if (cadence.skipWeekends) {
    const dow = baseDate.getDay();
    if (dow === 0) baseDate.setDate(baseDate.getDate() + 1); // Sun → Mon
    if (dow === 6) baseDate.setDate(baseDate.getDate() + 2); // Sat → Mon
  }

  // Enforce maxPerDay — push to next day if slot full
  let dayKey = baseDate.toISOString().slice(0, 10);
  while ((daySlotCount.get(dayKey) ?? 0) >= cadence.maxPerDay) {
    baseDate.setDate(baseDate.getDate() + 1);
    // Skip weekends again
    if (cadence.skipWeekends) {
      const dow = baseDate.getDay();
      if (dow === 0) baseDate.setDate(baseDate.getDate() + 1);
      if (dow === 6) baseDate.setDate(baseDate.getDate() + 2);
    }
    dayKey = baseDate.toISOString().slice(0, 10);
  }

  return baseDate;
}

function buildWindow(
  plannedDate: Date,
  suggestedTime?: string,
): ScheduleWindow {
  const earliest = new Date(plannedDate.getTime() - 12 * 3600000); // -12h
  const latest = new Date(plannedDate.getTime() + 24 * 3600000);   // +24h

  return {
    earliestAt: earliest.toISOString(),
    plannedAt: plannedDate.toISOString(),
    latestAt: latest.toISOString(),
    preferredTime: suggestedTime ?? '10:00',
  };
}

function buildDependencies(item: CampaignItem): ScheduleDependency[] {
  return item.dependsOn.map((depId) => ({
    dependsOnItemId: depId,
    requiredStatus: ScheduleItemStatus.EXECUTED,
    minDelayHours: 2,
  }));
}

// ---------------------------------------------------------------------------
// Calendar Event Hints
// ---------------------------------------------------------------------------

/**
 * Converts schedule items to CalendarEventHints for calendar view.
 */
export function toCalendarEvents(
  schedule: CampaignSchedule,
  campaignName: string,
): CalendarEventHint[] {
  return schedule.items.map((item) => ({
    scheduleItemId: item.id,
    campaignId: schedule.campaignId,
    campaignName,
    title: item.title,
    dateTime: item.confirmedAt ?? item.window.plannedAt,
    channel: item.channel,
    format: item.format,
    status: item.status,
    confirmed: item.confirmedAt !== null,
    color: statusToColor(item.status),
  }));
}

function statusToColor(status: ScheduleItemStatus): string {
  switch (status) {
    case ScheduleItemStatus.EXECUTED: return '#22c55e';
    case ScheduleItemStatus.CONFIRMED: return '#3b82f6';
    case ScheduleItemStatus.READY_TO_EXECUTE: return '#8b5cf6';
    case ScheduleItemStatus.PLANNED: return '#6b7280';
    case ScheduleItemStatus.DELAYED: return '#f59e0b';
    case ScheduleItemStatus.FAILED: return '#ef4444';
    case ScheduleItemStatus.WAITING_DEPENDENCY: return '#d1d5db';
    case ScheduleItemStatus.WAITING_APPROVAL: return '#fbbf24';
    case ScheduleItemStatus.SKIPPED: return '#9ca3af';
    default: return '#e5e7eb';
  }
}

// ---------------------------------------------------------------------------
// Calendar Overview
// ---------------------------------------------------------------------------

/**
 * Builds a CalendarOverview for a tenant across multiple schedules.
 */
export function buildCalendarOverview(
  tenantId: string,
  schedules: Array<{ schedule: CampaignSchedule; campaignName: string }>,
  periodStart: string,
  periodEnd: string,
): CalendarOverview {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  // Collect all events
  const allEvents: CalendarEventHint[] = [];
  const campaignIds = new Set<string>();

  for (const { schedule, campaignName } of schedules) {
    campaignIds.add(schedule.campaignId);
    allEvents.push(...toCalendarEvents(schedule, campaignName));
  }

  // Filter to period
  const periodEvents = allEvents.filter((e) => {
    const dt = new Date(e.dateTime);
    return dt >= start && dt <= end;
  });

  // Group by day
  const dayMap = new Map<string, CalendarEventHint[]>();
  const cursor = new Date(start);
  while (cursor <= end) {
    dayMap.set(cursor.toISOString().slice(0, 10), []);
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const event of periodEvents) {
    const dayKey = event.dateTime.slice(0, 10);
    const existing = dayMap.get(dayKey);
    if (existing) {
      existing.push(event);
    }
  }

  const days = Array.from(dayMap.entries()).map(([date, events]) => ({
    date,
    dayOfWeek: new Date(date).getDay(),
    events: events.sort((a, b) => a.dateTime.localeCompare(b.dateTime)),
    totalEvents: events.length,
  }));

  const executed = periodEvents.filter((e) => e.status === ScheduleItemStatus.EXECUTED).length;

  return {
    tenantId,
    periodStart,
    periodEnd,
    days,
    totals: {
      events: periodEvents.length,
      campaigns: campaignIds.size,
      executed,
      pending: periodEvents.length - executed,
    },
  };
}

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

export function computeCounts(items: ScheduleItem[]): CampaignSchedule['counts'] {
  let executed = 0;
  let confirmed = 0;
  let planned = 0;
  let delayed = 0;
  let failed = 0;

  for (const item of items) {
    switch (item.status) {
      case ScheduleItemStatus.EXECUTED:
        executed++;
        break;
      case ScheduleItemStatus.CONFIRMED:
      case ScheduleItemStatus.READY_TO_EXECUTE:
        confirmed++;
        break;
      case ScheduleItemStatus.DELAYED:
        delayed++;
        break;
      case ScheduleItemStatus.FAILED:
        failed++;
        break;
      case ScheduleItemStatus.SKIPPED:
        break;
      default:
        planned++;
    }
  }

  return { total: items.length, executed, confirmed, planned, delayed, failed };
}
