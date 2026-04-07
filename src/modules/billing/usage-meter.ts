/**
 * Usage Meter — Billing & Usage Tracking
 *
 * Metering: registra eventos de uso e atualiza contadores agregados.
 *
 * Fluxo:
 *   1. Ponto de integração chama recordUsage()
 *   2. Insere UsageRecord (audit trail)
 *   3. Incrementa UsageCounter (fast query)
 *   4. Opcionalmente verifica limite antes de permitir
 *
 * Persistência:
 *   - bookagent_usage (records individuais)
 *   - bookagent_usage_counters (contadores por tenant/período)
 *
 * Parte 75: Billing & Usage Tracking
 */

import { v4 as uuid } from 'uuid';

import type {
  UsageRecord,
  UsageCounter,
  BillingEvent,
} from '../../domain/entities/billing.js';
import {
  UsageEventType,
  UsagePeriod,
  BillingEventType,
} from '../../domain/entities/billing.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const USAGE_TABLE = 'bookagent_usage';
const COUNTER_TABLE = 'bookagent_usage_counters';
const BILLING_EVENTS_TABLE = 'bookagent_billing_events';

// ---------------------------------------------------------------------------
// Record Usage
// ---------------------------------------------------------------------------

export interface RecordUsageInput {
  tenantId: string;
  userId: string;
  eventType: UsageEventType;
  quantity?: number;
  jobId?: string;
  artifactId?: string;
  estimatedCostUsd?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Registra um evento de uso: insere record + incrementa counter.
 */
export async function recordUsage(
  input: RecordUsageInput,
  supabase: SupabaseClient | null,
): Promise<UsageRecord> {
  const now = new Date();
  const quantity = input.quantity ?? 1;

  const record: UsageRecord = {
    id: uuid(),
    tenantId: input.tenantId,
    userId: input.userId,
    eventType: input.eventType,
    quantity,
    jobId: input.jobId,
    artifactId: input.artifactId,
    estimatedCostUsd: input.estimatedCostUsd,
    metadata: input.metadata,
    createdAt: now,
  };

  // Persist record
  if (supabase) {
    await persistUsageRecord(supabase, record);
    await incrementCounter(supabase, input.tenantId, input.eventType, quantity, now);
  }

  logger.debug(
    `[UsageMeter] ${input.eventType}: tenant=${input.tenantId} qty=${quantity}` +
    (input.jobId ? ` job=${input.jobId}` : ''),
  );

  return record;
}

/**
 * Registra múltiplos eventos de uso em batch.
 */
export async function recordUsageBatch(
  inputs: RecordUsageInput[],
  supabase: SupabaseClient | null,
): Promise<void> {
  for (const input of inputs) {
    await recordUsage(input, supabase);
  }
}

// ---------------------------------------------------------------------------
// Get Counters
// ---------------------------------------------------------------------------

/**
 * Obtém o contador de uso para um tenant/evento/período.
 */
export async function getUsageCount(
  tenantId: string,
  eventType: UsageEventType,
  supabase: SupabaseClient | null,
  periodKey?: string,
): Promise<number> {
  if (!supabase) return 0;

  const key = periodKey ?? currentMonthKey();

  try {
    const rows = await supabase.select<{ count: number }>(COUNTER_TABLE, {
      filters: [
        { column: 'tenant_id', operator: 'eq', value: tenantId },
        { column: 'event_type', operator: 'eq', value: eventType },
        { column: 'period_key', operator: 'eq', value: key },
      ],
      select: 'count',
      limit: 1,
    });

    return rows[0]?.count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Obtém todos os contadores de um tenant para o período atual.
 */
export async function getAllUsageCounts(
  tenantId: string,
  supabase: SupabaseClient | null,
  periodKey?: string,
): Promise<Map<UsageEventType, number>> {
  const counts = new Map<UsageEventType, number>();
  if (!supabase) return counts;

  const key = periodKey ?? currentMonthKey();

  try {
    const rows = await supabase.select<{
      event_type: string;
      count: number;
    }>(COUNTER_TABLE, {
      filters: [
        { column: 'tenant_id', operator: 'eq', value: tenantId },
        { column: 'period_key', operator: 'eq', value: key },
      ],
      select: 'event_type,count',
    });

    for (const row of rows) {
      counts.set(row.event_type as UsageEventType, row.count);
    }
  } catch {
    // graceful
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Billing Events
// ---------------------------------------------------------------------------

/**
 * Registra um evento de billing (mudança de plano, trial, etc.).
 */
export async function recordBillingEvent(
  event: Omit<BillingEvent, 'id' | 'createdAt'>,
  supabase: SupabaseClient | null,
): Promise<BillingEvent> {
  const full: BillingEvent = {
    ...event,
    id: uuid(),
    createdAt: new Date(),
  };

  if (supabase) {
    try {
      await supabase.insert(BILLING_EVENTS_TABLE, {
        id: full.id,
        tenant_id: full.tenantId,
        event_type: full.eventType,
        previous_plan: full.previousPlan ?? null,
        current_plan: full.currentPlan,
        details: full.details,
        metadata: full.metadata ? JSON.stringify(full.metadata) : null,
        created_at: full.createdAt.toISOString(),
      });
    } catch (err) {
      logger.warn(`[UsageMeter] Failed to persist billing event: ${err}`);
    }
  }

  logger.info(
    `[UsageMeter] Billing event: ${full.eventType} tenant=${full.tenantId} ` +
    `plan=${full.currentPlan}`,
  );

  return full;
}

// ---------------------------------------------------------------------------
// Persistence Helpers
// ---------------------------------------------------------------------------

async function persistUsageRecord(
  supabase: SupabaseClient,
  record: UsageRecord,
): Promise<void> {
  try {
    await supabase.insert(USAGE_TABLE, {
      id: record.id,
      tenant_id: record.tenantId,
      user_id: record.userId,
      event_type: record.eventType,
      quantity: record.quantity,
      job_id: record.jobId ?? null,
      artifact_id: record.artifactId ?? null,
      estimated_cost_usd: record.estimatedCostUsd ?? null,
      metadata: record.metadata ? JSON.stringify(record.metadata) : null,
      created_at: record.createdAt.toISOString(),
    });
  } catch (err) {
    logger.warn(`[UsageMeter] Failed to persist usage record ${record.id}: ${err}`);
  }
}

async function incrementCounter(
  supabase: SupabaseClient,
  tenantId: string,
  eventType: UsageEventType,
  quantity: number,
  now: Date,
): Promise<void> {
  const monthKey = toMonthKey(now);

  try {
    // Try to read existing counter
    const rows = await supabase.select<{ count: number; total_value: number }>(
      COUNTER_TABLE,
      {
        filters: [
          { column: 'tenant_id', operator: 'eq', value: tenantId },
          { column: 'event_type', operator: 'eq', value: eventType },
          { column: 'period_key', operator: 'eq', value: monthKey },
        ],
        select: 'count,total_value',
        limit: 1,
      },
    );

    if (rows.length > 0) {
      // Update existing counter
      await supabase.update(COUNTER_TABLE, {
        column: 'tenant_id',
        operator: 'eq',
        value: tenantId,
      }, {
        count: (rows[0].count ?? 0) + quantity,
        total_value: (rows[0].total_value ?? 0) + quantity,
        updated_at: now.toISOString(),
      });
    } else {
      // Insert new counter
      await supabase.insert(COUNTER_TABLE, {
        tenant_id: tenantId,
        event_type: eventType,
        period_key: monthKey,
        period: UsagePeriod.MONTHLY,
        count: quantity,
        total_value: quantity,
        updated_at: now.toISOString(),
      });
    }
  } catch (err) {
    logger.warn(
      `[UsageMeter] Failed to increment counter ` +
      `${tenantId}/${eventType}/${monthKey}: ${err}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Period Helpers
// ---------------------------------------------------------------------------

export function currentMonthKey(): string {
  return toMonthKey(new Date());
}

export function toMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
