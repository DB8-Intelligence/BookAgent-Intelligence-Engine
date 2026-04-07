/**
 * Admin Controller — Admin / Ops Console
 *
 * Endpoints administrativos protegidos por API key + role admin.
 *
 * Consultas:
 *   GET  /admin/tenants        → Listar tenants
 *   GET  /admin/jobs           → Listar jobs (filtráveis)
 *   GET  /admin/jobs/failed    → Jobs com falha
 *   GET  /admin/publications   → Publicações (filtráveis)
 *   GET  /admin/publications/failed → Publicações falhas
 *   GET  /admin/billing        → Visão de billing
 *   GET  /admin/health         → System health snapshot
 *   GET  /admin/audit          → Audit trail de ações admin
 *
 * Ações:
 *   POST /admin/actions        → Executar ação administrativa
 *
 * Parte 77: Admin / Ops Console Backend
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../helpers/response.js';
import {
  listTenants,
  listJobs,
  listFailedJobs,
  listPublications,
  listFailedPublications,
  listBillingOverview,
  getSystemHealth,
  executeAdminAction,
} from '../../modules/admin/index.js';
import { AdminActionType } from '../../domain/entities/admin.js';
import type { AdminListParams } from '../../domain/entities/admin.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForAdmin(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

// ============================================================================
// Query Params Parser
// ============================================================================

function parseListParams(query: Request['query']): AdminListParams {
  return {
    page: query.page ? Number(query.page) : undefined,
    limit: query.limit ? Math.min(Number(query.limit), 200) : 50,
    status: typeof query.status === 'string' ? query.status : undefined,
    planTier: typeof query.planTier === 'string' ? query.planTier : undefined,
    tenantId: typeof query.tenantId === 'string' ? query.tenantId : undefined,
    since: typeof query.since === 'string' ? query.since : undefined,
    sortBy: typeof query.sortBy === 'string' ? query.sortBy : undefined,
    sortDir: query.sortDir === 'asc' ? 'asc' : 'desc',
  };
}

// ============================================================================
// GET /admin/tenants
// ============================================================================

export async function getAdminTenants(req: Request, res: Response): Promise<void> {
  try {
    const params = parseListParams(req.query);
    const tenants = await listTenants(supabaseClient, params);
    sendSuccess(res, { tenants, total: tenants.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar tenants', 500, err);
  }
}

// ============================================================================
// GET /admin/jobs
// ============================================================================

export async function getAdminJobs(req: Request, res: Response): Promise<void> {
  try {
    const params = parseListParams(req.query);
    const jobs = await listJobs(supabaseClient, params);
    sendSuccess(res, { jobs, total: jobs.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar jobs', 500, err);
  }
}

// ============================================================================
// GET /admin/jobs/failed
// ============================================================================

export async function getAdminFailedJobs(req: Request, res: Response): Promise<void> {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const jobs = await listFailedJobs(supabaseClient, limit);
    sendSuccess(res, { jobs, total: jobs.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar jobs falhos', 500, err);
  }
}

// ============================================================================
// GET /admin/publications
// ============================================================================

export async function getAdminPublications(req: Request, res: Response): Promise<void> {
  try {
    const params = parseListParams(req.query);
    const publications = await listPublications(supabaseClient, params);
    sendSuccess(res, { publications, total: publications.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar publicações', 500, err);
  }
}

// ============================================================================
// GET /admin/publications/failed
// ============================================================================

export async function getAdminFailedPublications(req: Request, res: Response): Promise<void> {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const pubs = await listFailedPublications(supabaseClient, limit);
    sendSuccess(res, { publications: pubs, total: pubs.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar publicações falhas', 500, err);
  }
}

// ============================================================================
// GET /admin/billing
// ============================================================================

export async function getAdminBilling(req: Request, res: Response): Promise<void> {
  try {
    const params = parseListParams(req.query);
    const billing = await listBillingOverview(supabaseClient, params);
    sendSuccess(res, { billing, total: billing.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar billing', 500, err);
  }
}

// ============================================================================
// GET /admin/health
// ============================================================================

export async function getAdminHealth(_req: Request, res: Response): Promise<void> {
  try {
    const health = await getSystemHealth(supabaseClient);
    sendSuccess(res, health);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar health snapshot', 500, err);
  }
}

// ============================================================================
// GET /admin/audit
// ============================================================================

export async function getAdminAudit(req: Request, res: Response): Promise<void> {
  if (!supabaseClient) {
    sendSuccess(res, { entries: [], total: 0 });
    return;
  }

  try {
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 200) : 50;
    const rows = await supabaseClient.select<{
      id: string;
      action: string;
      target_type: string;
      target_id: string;
      executed_by: string;
      result: string;
      details: string;
      metadata: string | null;
      created_at: string;
    }>('bookagent_admin_audit', {
      orderBy: 'created_at',
      orderDesc: true,
      limit,
    });

    sendSuccess(res, { entries: rows, total: rows.length });
  } catch (err) {
    sendError(res, 'DB_ERROR', 'Falha ao buscar audit trail', 500, err);
  }
}

// ============================================================================
// POST /admin/actions
// ============================================================================

const ActionSchema = z.object({
  action: z.nativeEnum(AdminActionType),
  targetId: z.string().min(1),
  executedBy: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

export async function executeAction(req: Request, res: Response): Promise<void> {
  const parsed = ActionSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Dados inválidos', 400, parsed.error.flatten());
    return;
  }

  try {
    const result = await executeAdminAction(parsed.data, supabaseClient);

    logger.info(
      `[adminController] Action ${result.action}: ${result.success ? 'OK' : 'FAIL'} ` +
      `target=${result.targetId} by=${result.executedBy}`,
    );

    sendSuccess(res, result, result.success ? 200 : 422);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao executar ação', 500, err);
  }
}
