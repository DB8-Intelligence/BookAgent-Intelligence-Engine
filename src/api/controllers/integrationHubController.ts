/**
 * Integration Hub Controller — Conectores Externos
 *
 * POST   /api/v1/integrations              → Criar conexão
 * GET    /api/v1/integrations              → Listar conexões
 * GET    /api/v1/integrations/catalog      → Catálogo de integrações
 * GET    /api/v1/integrations/:id          → Detalhe da conexão
 * DELETE /api/v1/integrations/:id          → Desativar conexão
 * POST   /api/v1/integrations/:id/ping     → Health check
 * POST   /api/v1/integrations/:id/test     → Testar dispatch
 * GET    /api/v1/integrations/:id/logs     → Logs de sync
 *
 * Parte 103: Escala — Integrações
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import {
  createConnection,
  listConnections,
  getConnection,
  deleteConnection,
  dispatchSyncEvent,
  pingConnection,
  getCatalog,
  getSyncLogs,
} from '../../modules/integration-hub/index.js';
import { SyncEventType, type ExternalSystemType } from '../../domain/entities/integration-hub.js';

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForIntegrationHub(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

function getTenantId(req: Request): string {
  const ctx = (req as unknown as Record<string, unknown>)['tenantContext'] as
    | { tenantId: string }
    | undefined;
  return ctx?.tenantId ?? 'default';
}

export async function handleCreateConnection(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const { system, name, direction, config, syncEvents } = req.body as Record<string, unknown>;

    if (!system || !name || !config) {
      sendError(res, 'INVALID_INPUT', 'system, name, and config are required', 400);
      return;
    }

    const conn = await createConnection({
      tenantId,
      system: system as ExternalSystemType,
      name: name as string,
      direction: direction as never,
      config: config as never,
      syncEvents: syncEvents as never,
    }, supabaseClient);

    sendSuccess(res, conn, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to create connection', 500, err);
  }
}

export async function handleListConnections(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const connections = await listConnections(tenantId, supabaseClient);
    sendSuccess(res, { connections, total: connections.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to list connections', 500, err);
  }
}

export async function handleGetCatalog(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, { catalog: getCatalog() });
}

export async function handleGetConnection(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const conn = await getConnection(id, supabaseClient);

    if (!conn) {
      sendError(res, 'NOT_FOUND', 'Connection not found', 404);
      return;
    }

    sendSuccess(res, conn);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to get connection', 500, err);
  }
}

export async function handleDeleteConnection(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const ok = await deleteConnection(id, supabaseClient);

    if (!ok) {
      sendError(res, 'NOT_FOUND', 'Connection not found', 404);
      return;
    }

    sendSuccess(res, { deleted: true, id });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to delete connection', 500, err);
  }
}

export async function handlePingConnection(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await pingConnection(id, supabaseClient);
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to ping connection', 500, err);
  }
}

export async function handleTestDispatch(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const { event } = req.body as { event?: string };

    const logs = await dispatchSyncEvent(
      tenantId,
      (event as SyncEventType) ?? SyncEventType.JOB_COMPLETED,
      { message: 'Test dispatch', timestamp: new Date().toISOString() },
      supabaseClient,
    );

    sendSuccess(res, { dispatched: logs.length, logs });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to dispatch', 500, err);
  }
}

export async function handleGetSyncLogs(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const limit = Math.min(Number(req.query['limit']) || 20, 100);
    const logs = await getSyncLogs(id, supabaseClient, limit);
    sendSuccess(res, { logs, total: logs.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to get logs', 500, err);
  }
}
