/**
 * Integration Hub — Conectores para Sistemas Externos
 *
 * Gerencia conexões com ImobCreator, NexoOmnix, CRMs e
 * plataformas de automação (Zapier, n8n).
 *
 * Parte 103: Escala — Integrações
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  ExternalConnection,
  ConnectorConfig,
  SyncLog,
} from '../../domain/entities/integration-hub.js';
import {
  ExternalSystemType,
  ConnectionStatus,
  SyncDirection,
  SyncEventType,
  SyncLogStatus,
  INTEGRATION_CATALOG,
} from '../../domain/entities/integration-hub.js';
import { logger } from '../../utils/logger.js';

const CONNECTIONS_TABLE = 'bookagent_external_connections';
const SYNC_LOGS_TABLE   = 'bookagent_sync_logs';

// ---------------------------------------------------------------------------
// Connection CRUD
// ---------------------------------------------------------------------------

export interface CreateConnectionInput {
  tenantId: string;
  system: ExternalSystemType;
  name: string;
  direction?: SyncDirection;
  config: ConnectorConfig;
  syncEvents?: SyncEventType[];
}

export async function createConnection(
  input: CreateConnectionInput,
  supabase: SupabaseClient | null,
): Promise<ExternalConnection> {
  const now = new Date().toISOString();

  // Validate system type
  const def = INTEGRATION_CATALOG.find((d) => d.system === input.system);
  const syncEvents = input.syncEvents ?? def?.supportedEvents ?? [];

  const conn: ExternalConnection = {
    id: uuid(),
    tenantId: input.tenantId,
    system: input.system,
    name: input.name,
    status: ConnectionStatus.ACTIVE,
    direction: input.direction ?? SyncDirection.OUTBOUND,
    config: input.config,
    syncEvents,
    lastPingAt: null,
    lastPingOk: false,
    errorMessage: null,
    totalSyncs: 0,
    totalErrors: 0,
    createdAt: now,
    updatedAt: now,
  };

  if (supabase) {
    await supabase.upsert(CONNECTIONS_TABLE, {
      id: conn.id,
      tenant_id: conn.tenantId,
      system: conn.system,
      name: conn.name,
      status: conn.status,
      direction: conn.direction,
      config: JSON.stringify(conn.config),
      sync_events: JSON.stringify(conn.syncEvents),
      total_syncs: 0,
      total_errors: 0,
      created_at: now,
      updated_at: now,
    }, 'id');
  }

  logger.info(`[IntegrationHub] Connection created: ${conn.id} system=${input.system}`);
  return conn;
}

export async function listConnections(
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<ExternalConnection[]> {
  if (!supabase) return [];
  try {
    const rows = await supabase.select<Record<string, unknown>>(CONNECTIONS_TABLE, {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      orderBy: 'created_at', orderDesc: true, limit: 50,
    });
    return rows.map(mapConnection);
  } catch { return []; }
}

export async function getConnection(
  connectionId: string,
  supabase: SupabaseClient | null,
): Promise<ExternalConnection | null> {
  if (!supabase) return null;
  try {
    const rows = await supabase.select<Record<string, unknown>>(CONNECTIONS_TABLE, {
      filters: [{ column: 'id', operator: 'eq', value: connectionId }],
      limit: 1,
    });
    return rows.length > 0 ? mapConnection(rows[0]) : null;
  } catch { return null; }
}

export async function updateConnectionStatus(
  connectionId: string,
  status: ConnectionStatus,
  errorMessage: string | null,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;
  await supabase.upsert(CONNECTIONS_TABLE, {
    id: connectionId,
    status,
    error_message: errorMessage,
    updated_at: new Date().toISOString(),
  }, 'id');
}

export async function deleteConnection(
  connectionId: string,
  supabase: SupabaseClient | null,
): Promise<boolean> {
  if (!supabase) return false;
  try {
    await updateConnectionStatus(connectionId, ConnectionStatus.INACTIVE, null, supabase);
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Sync Dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch event to all connections that listen for this event type.
 */
export async function dispatchSyncEvent(
  tenantId: string,
  event: SyncEventType,
  payload: Record<string, unknown>,
  supabase: SupabaseClient | null,
): Promise<SyncLog[]> {
  if (!supabase) return [];

  const logs: SyncLog[] = [];

  try {
    const rows = await supabase.select<Record<string, unknown>>(CONNECTIONS_TABLE, {
      filters: [
        { column: 'tenant_id', operator: 'eq', value: tenantId },
        { column: 'status', operator: 'eq', value: 'active' },
      ],
      limit: 50,
    });

    for (const row of rows) {
      const conn = mapConnection(row);

      // Check if connection listens for this event
      if (!conn.syncEvents.includes(event)) continue;

      const log = await sendToExternal(conn, event, payload, supabase);
      logs.push(log);
    }
  } catch (err) {
    logger.error(`[IntegrationHub] Dispatch error: ${err}`);
  }

  return logs;
}

async function sendToExternal(
  conn: ExternalConnection,
  event: SyncEventType,
  payload: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<SyncLog> {
  const startTime = Date.now();
  const url = conn.config.webhookUrl ?? conn.config.apiUrl;

  const log: SyncLog = {
    id: uuid(),
    connectionId: conn.id,
    tenantId: conn.tenantId,
    event,
    direction: SyncDirection.OUTBOUND,
    status: SyncLogStatus.SUCCESS,
    payload,
    response: null,
    httpStatus: null,
    durationMs: 0,
    errorMessage: null,
    createdAt: new Date().toISOString(),
  };

  if (!url) {
    log.status = SyncLogStatus.SKIPPED;
    log.errorMessage = 'No URL configured';
    log.durationMs = Date.now() - startTime;
    await persistSyncLog(log, supabase);
    return log;
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-BookAgent-Event': event,
      'X-BookAgent-Connection': conn.id,
      ...(conn.config.headers ?? {}),
    };

    if (conn.config.apiKey) {
      headers['Authorization'] = `Bearer ${conn.config.apiKey}`;
    }

    // Sign payload if webhook secret configured
    if (conn.config.webhookSecret) {
      const crypto = require('crypto') as typeof import('crypto');
      const timestamp = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({ event, timestamp, data: payload });
      const signature = crypto
        .createHmac('sha256', conn.config.webhookSecret)
        .update(`${timestamp}.${body}`)
        .digest('hex');
      headers['X-BookAgent-Signature'] = `t=${timestamp},v1=${signature}`;
    }

    const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(15000),
    });

    log.httpStatus = res.status;
    log.durationMs = Date.now() - startTime;

    if (res.ok) {
      try { log.response = await res.json() as Record<string, unknown>; } catch { /* ignore */ }
      log.status = SyncLogStatus.SUCCESS;
    } else {
      log.status = SyncLogStatus.FAILED;
      log.errorMessage = `HTTP ${res.status}`;
    }
  } catch (err) {
    log.status = SyncLogStatus.FAILED;
    log.errorMessage = err instanceof Error ? err.message : String(err);
    log.durationMs = Date.now() - startTime;
  }

  await persistSyncLog(log, supabase);

  // Update connection counters
  try {
    await supabase.upsert(CONNECTIONS_TABLE, {
      id: conn.id,
      total_syncs: conn.totalSyncs + 1,
      total_errors: log.status === SyncLogStatus.FAILED ? conn.totalErrors + 1 : conn.totalErrors,
      last_ping_at: new Date().toISOString(),
      last_ping_ok: log.status === SyncLogStatus.SUCCESS,
      error_message: log.errorMessage,
      updated_at: new Date().toISOString(),
    }, 'id');
  } catch { /* graceful */ }

  if (log.status === SyncLogStatus.SUCCESS) {
    logger.info(`[IntegrationHub] Sync OK: ${conn.system} event=${event} ${log.durationMs}ms`);
  } else {
    logger.warn(`[IntegrationHub] Sync FAILED: ${conn.system} event=${event} — ${log.errorMessage}`);
  }

  return log;
}

async function persistSyncLog(log: SyncLog, supabase: SupabaseClient): Promise<void> {
  try {
    await supabase.upsert(SYNC_LOGS_TABLE, {
      id: log.id,
      connection_id: log.connectionId,
      tenant_id: log.tenantId,
      event: log.event,
      direction: log.direction,
      status: log.status,
      payload: JSON.stringify(log.payload),
      response: log.response ? JSON.stringify(log.response) : null,
      http_status: log.httpStatus,
      duration_ms: log.durationMs,
      error_message: log.errorMessage,
      created_at: log.createdAt,
    }, 'id');
  } catch { /* graceful */ }
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

export async function pingConnection(
  connectionId: string,
  supabase: SupabaseClient | null,
): Promise<{ ok: boolean; durationMs: number; error: string | null }> {
  if (!supabase) return { ok: false, durationMs: 0, error: 'No database' };

  const conn = await getConnection(connectionId, supabase);
  if (!conn) return { ok: false, durationMs: 0, error: 'Connection not found' };

  const url = conn.config.webhookUrl ?? conn.config.apiUrl;
  if (!url) return { ok: false, durationMs: 0, error: 'No URL configured' };

  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
      headers: conn.config.apiKey ? { 'Authorization': `Bearer ${conn.config.apiKey}` } : {},
    });
    const durationMs = Date.now() - start;
    const ok = res.status < 500;

    await supabase.upsert(CONNECTIONS_TABLE, {
      id: connectionId,
      last_ping_at: new Date().toISOString(),
      last_ping_ok: ok,
      error_message: ok ? null : `HTTP ${res.status}`,
      updated_at: new Date().toISOString(),
    }, 'id');

    return { ok, durationMs, error: ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    const durationMs = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);

    await supabase.upsert(CONNECTIONS_TABLE, {
      id: connectionId,
      last_ping_at: new Date().toISOString(),
      last_ping_ok: false,
      error_message: error,
      updated_at: new Date().toISOString(),
    }, 'id');

    return { ok: false, durationMs, error };
  }
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export function getCatalog() {
  return INTEGRATION_CATALOG;
}

export async function getSyncLogs(
  connectionId: string,
  supabase: SupabaseClient | null,
  limit = 20,
): Promise<SyncLog[]> {
  if (!supabase) return [];
  try {
    const rows = await supabase.select<Record<string, unknown>>(SYNC_LOGS_TABLE, {
      filters: [{ column: 'connection_id', operator: 'eq', value: connectionId }],
      orderBy: 'created_at', orderDesc: true, limit,
    });
    return rows.map(mapSyncLog);
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Row Mappers
// ---------------------------------------------------------------------------

function pj<T>(v: unknown, fb: T): T {
  if (!v) return fb;
  try { return typeof v === 'string' ? JSON.parse(v) : v as T; } catch { return fb; }
}

function mapConnection(r: Record<string, unknown>): ExternalConnection {
  return {
    id: r['id'] as string,
    tenantId: (r['tenant_id'] as string) ?? '',
    system: (r['system'] as ExternalSystemType) ?? ExternalSystemType.CUSTOM_WEBHOOK,
    name: (r['name'] as string) ?? '',
    status: (r['status'] as ConnectionStatus) ?? ConnectionStatus.INACTIVE,
    direction: (r['direction'] as SyncDirection) ?? SyncDirection.OUTBOUND,
    config: pj(r['config'], {}),
    syncEvents: pj(r['sync_events'], []),
    lastPingAt: (r['last_ping_at'] as string) ?? null,
    lastPingOk: (r['last_ping_ok'] as boolean) ?? false,
    errorMessage: (r['error_message'] as string) ?? null,
    totalSyncs: (r['total_syncs'] as number) ?? 0,
    totalErrors: (r['total_errors'] as number) ?? 0,
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string,
  };
}

function mapSyncLog(r: Record<string, unknown>): SyncLog {
  return {
    id: r['id'] as string,
    connectionId: (r['connection_id'] as string) ?? '',
    tenantId: (r['tenant_id'] as string) ?? '',
    event: (r['event'] as SyncEventType) ?? SyncEventType.JOB_COMPLETED,
    direction: (r['direction'] as SyncDirection) ?? SyncDirection.OUTBOUND,
    status: (r['status'] as SyncLogStatus) ?? SyncLogStatus.FAILED,
    payload: pj(r['payload'], {}),
    response: pj(r['response'], null),
    httpStatus: (r['http_status'] as number) ?? null,
    durationMs: (r['duration_ms'] as number) ?? 0,
    errorMessage: (r['error_message'] as string) ?? null,
    createdAt: r['created_at'] as string,
  };
}
