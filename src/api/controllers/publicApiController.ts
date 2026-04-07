/**
 * Public API Controller — Scale & Partner API
 *
 * API programatica para integradores e parceiros.
 * Requer plano Business (apiAccess=true).
 *
 * POST /api/public/v1/process      → Iniciar processamento via API
 * GET  /api/public/v1/jobs/:id     → Status do job
 * GET  /api/public/v1/artifacts/:jobId → Listar artefatos
 * GET  /api/public/v1/usage        → Uso atual da API key
 *
 * Autenticacao: header X-API-Key
 *
 * Parte 103: Escala + API
 */

import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForPublicApi(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

// ============================================================================
// API Key Authentication Middleware
// ============================================================================

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (!apiKey) {
    sendError(res, 'UNAUTHORIZED', 'Missing X-API-Key header', 401);
    return;
  }

  if (!supabaseClient) {
    sendError(res, 'SERVICE_UNAVAILABLE', 'API not available in standalone mode', 503);
    return;
  }

  // Lookup API key → tenant
  try {
    const rows = await supabaseClient.select<Record<string, unknown>>('bookagent_api_keys', {
      filters: [
        { column: 'key_hash', operator: 'eq', value: hashApiKey(apiKey) },
        { column: 'is_active', operator: 'eq', value: true },
      ],
      limit: 1,
    });

    if (rows.length === 0) {
      sendError(res, 'UNAUTHORIZED', 'Invalid or inactive API key', 401);
      return;
    }

    const keyRecord = rows[0];
    const tenantId = keyRecord['tenant_id'] as string;
    const planTier = (keyRecord['plan_tier'] as string) ?? 'basic';

    // Check API access
    if (planTier !== 'business') {
      sendError(res, 'FORBIDDEN', 'API access requires Business plan', 403);
      return;
    }

    // Inject tenant info into request
    (req as unknown as Record<string, unknown>)['apiTenantId'] = tenantId;
    (req as unknown as Record<string, unknown>)['apiPlanTier'] = planTier;
    (req as unknown as Record<string, unknown>)['apiKeyId'] = keyRecord['id'] as string;

    // Log API usage
    try {
      await supabaseClient.upsert('bookagent_api_usage', {
        id: require('crypto').randomUUID(),
        api_key_id: keyRecord['id'],
        tenant_id: tenantId,
        endpoint: req.path,
        method: req.method,
        created_at: new Date().toISOString(),
      });
    } catch { /* graceful */ }

    next();
  } catch (err) {
    logger.error(`[PublicAPI] Auth error: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Authentication failed', 500);
  }
}

function hashApiKey(key: string): string {
  const crypto = require('crypto') as typeof import('crypto');
  return crypto.createHash('sha256').update(key).digest('hex');
}

// ============================================================================
// Endpoints
// ============================================================================

/**
 * POST /api/public/v1/process — Iniciar processamento via API
 */
export async function publicProcess(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = (req as unknown as Record<string, unknown>)['apiTenantId'] as string;
    const { file_url, type, user_context, webhook_url } = req.body as {
      file_url?: string;
      type?: string;
      user_context?: Record<string, string>;
      webhook_url?: string;
    };

    if (!file_url || !type) {
      sendError(res, 'INVALID_INPUT', 'file_url and type are required', 400);
      return;
    }

    const validTypes = ['pdf', 'video', 'audio', 'pptx', 'document'];
    if (!validTypes.includes(type)) {
      sendError(res, 'INVALID_INPUT', `Invalid type. Valid: ${validTypes.join(', ')}`, 400);
      return;
    }

    // Record usage
    if (supabaseClient) {
      try {
        await supabaseClient.upsert('bookagent_api_usage', {
          id: require('crypto').randomUUID(),
          api_key_id: (req as unknown as Record<string, unknown>)['apiKeyId'] as string,
          tenant_id: tenantId,
          endpoint: '/process',
          method: 'POST',
          metadata: JSON.stringify({ type, file_url: file_url.slice(0, 100) }),
          created_at: new Date().toISOString(),
        });
      } catch { /* graceful */ }
    }

    // TODO: Call orchestrator.process() with tenant context
    // For now, return accepted with mock job_id
    const jobId = require('crypto').randomUUID();

    sendSuccess(res, {
      job_id: jobId,
      status: 'pending',
      message: `Job queued for processing (type=${type})`,
      tenant_id: tenantId,
    }, 202);

    logger.info(`[PublicAPI] Process started: job=${jobId} tenant=${tenantId} type=${type}`);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to start process', 500, err);
  }
}

/**
 * GET /api/public/v1/jobs/:id — Status do job
 */
export async function publicGetJob(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = (req as unknown as Record<string, unknown>)['apiTenantId'] as string;
    const { id } = req.params;

    if (!supabaseClient) {
      sendError(res, 'SERVICE_UNAVAILABLE', 'Not available', 503);
      return;
    }

    const rows = await supabaseClient.select<Record<string, unknown>>('bookagent_job_meta', {
      filters: [
        { column: 'job_id', operator: 'eq', value: id },
        { column: 'tenant_id', operator: 'eq', value: tenantId },
      ],
      limit: 1,
    });

    if (rows.length === 0) {
      sendError(res, 'NOT_FOUND', 'Job not found', 404);
      return;
    }

    const job = rows[0];
    sendSuccess(res, {
      job_id: job['job_id'],
      status: job['approval_status'],
      tenant_id: job['tenant_id'],
      created_at: job['created_at'],
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to get job', 500, err);
  }
}

/**
 * GET /api/public/v1/artifacts/:jobId — Listar artefatos
 */
export async function publicGetArtifacts(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = (req as unknown as Record<string, unknown>)['apiTenantId'] as string;
    const { jobId } = req.params;

    if (!supabaseClient) {
      sendError(res, 'SERVICE_UNAVAILABLE', 'Not available', 503);
      return;
    }

    // Verify job belongs to tenant
    const jobRows = await supabaseClient.select<Record<string, unknown>>('bookagent_job_meta', {
      filters: [
        { column: 'job_id', operator: 'eq', value: jobId },
        { column: 'tenant_id', operator: 'eq', value: tenantId },
      ],
      limit: 1,
    });

    if (jobRows.length === 0) {
      sendError(res, 'NOT_FOUND', 'Job not found', 404);
      return;
    }

    const artifacts = await supabaseClient.select<Record<string, unknown>>('bookagent_job_artifacts', {
      filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
      limit: 100,
    });

    sendSuccess(res, {
      job_id: jobId,
      artifacts: artifacts.map((a) => ({
        id: a['id'],
        artifact_type: a['artifact_type'],
        export_format: a['export_format'],
        title: a['title'],
        size_bytes: a['size_bytes'],
        status: a['status'],
        created_at: a['created_at'],
      })),
      total: artifacts.length,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to get artifacts', 500, err);
  }
}

/**
 * GET /api/public/v1/usage — Uso atual da API key
 */
export async function publicGetUsage(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = (req as unknown as Record<string, unknown>)['apiTenantId'] as string;
    const apiKeyId = (req as unknown as Record<string, unknown>)['apiKeyId'] as string;

    if (!supabaseClient) {
      sendSuccess(res, { requests: 0, period: 'current_month' });
      return;
    }

    const rows = await supabaseClient.select<Record<string, unknown>>('bookagent_api_usage', {
      filters: [{ column: 'api_key_id', operator: 'eq', value: apiKeyId }],
      select: 'id',
      limit: 10000,
    });

    sendSuccess(res, {
      tenant_id: tenantId,
      api_key_id: apiKeyId,
      requests_total: rows.length,
      period: 'all_time',
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to get usage', 500, err);
  }
}
