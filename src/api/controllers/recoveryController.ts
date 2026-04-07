/**
 * Recovery Controller — Self-Healing Operations & Recovery
 *
 * GET  /recovery/stuck                → Detectar stuck states
 * POST /recovery/reconcile            → Executar reconciliação
 * POST /recovery/repair               → Disparar recovery manual
 * GET  /recovery/audit                → Histórico de recovery
 * GET  /recovery/policies             → Listar políticas
 *
 * Parte 91: Self-Healing Operations & Recovery
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';
import {
  detectStuckStates,
  runReconciliation,
  executeRecovery,
  recoverStuckStates,
  listRecoveryAttempts,
  getPolicy,
} from '../../modules/recovery/index.js';
import {
  FailureClass,
  DEFAULT_RECOVERY_POLICIES,
} from '../../domain/entities/recovery.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForRecovery(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

// ============================================================================
// Helpers
// ============================================================================

function getTenantCtx(req: Request) {
  return req.tenantContext ?? createDefaultTenantContext();
}

// ============================================================================
// Endpoints
// ============================================================================

/**
 * GET /recovery/stuck — Detectar stuck states
 */
export async function getStuckStates(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const global = req.query['global'] === 'true';
    const tenantId = global ? null : tenantCtx.tenantId;

    const signals = await detectStuckStates(tenantId, supabaseClient);

    sendSuccess(res, {
      stuckStates: signals,
      total: signals.length,
      scope: global ? 'global' : tenantCtx.tenantId,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao detectar stuck states', 500, err);
  }
}

/**
 * POST /recovery/reconcile — Executar reconciliação
 */
export async function reconcile(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { scope } = req.body as { scope?: string };

    const validScopes = ['jobs', 'publications', 'billing', 'artifacts', 'schedules'] as const;
    const selectedScope = validScopes.includes(scope as typeof validScopes[number])
      ? (scope as typeof validScopes[number])
      : 'jobs';

    const task = await runReconciliation(selectedScope, tenantCtx.tenantId, supabaseClient);

    sendSuccess(res, task, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha na reconciliação', 500, err);
  }
}

/**
 * POST /recovery/repair — Disparar recovery manual para entidade
 */
export async function repairEntity(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { failureClass, entityType, entityId } = req.body as {
      failureClass?: string;
      entityType?: string;
      entityId?: string;
    };

    if (!failureClass || !entityType || !entityId) {
      sendError(res, 'INVALID_INPUT', 'failureClass, entityType e entityId são obrigatórios', 400);
      return;
    }

    if (!Object.values(FailureClass).includes(failureClass as FailureClass)) {
      sendError(res, 'INVALID_INPUT', 'failureClass inválido', 400);
      return;
    }

    const attempt = await executeRecovery(
      failureClass as FailureClass,
      entityType,
      entityId,
      tenantCtx.tenantId,
      supabaseClient,
    );

    sendSuccess(res, attempt, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha no repair', 500, err);
  }
}

/**
 * POST /recovery/stuck/repair — Auto-repair all stuck states
 */
export async function repairStuckStates(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const signals = await detectStuckStates(tenantCtx.tenantId, supabaseClient);

    if (signals.length === 0) {
      sendSuccess(res, { message: 'Nenhum stuck state encontrado', attempts: [], total: 0 });
      return;
    }

    const attempts = await recoverStuckStates(signals, supabaseClient);

    sendSuccess(res, {
      stuckFound: signals.length,
      attempts,
      total: attempts.length,
    }, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao reparar stuck states', 500, err);
  }
}

/**
 * GET /recovery/audit — Histórico de recovery
 */
export async function getRecoveryAudit(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const global = req.query['global'] === 'true';
    const tenantId = global ? null : tenantCtx.tenantId;

    const attempts = await listRecoveryAttempts(tenantId, supabaseClient);

    sendSuccess(res, {
      attempts,
      total: attempts.length,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar auditoria', 500, err);
  }
}

/**
 * GET /recovery/policies — Listar políticas de recovery
 */
export async function getRecoveryPolicies(_req: Request, res: Response): Promise<void> {
  try {
    sendSuccess(res, {
      policies: DEFAULT_RECOVERY_POLICIES.map((p) => ({
        failureClass: p.failureClass,
        maxRetries: p.maxRetries,
        backoffBaseSec: p.backoffBaseSec,
        actions: p.actions,
        escalationThreshold: p.escalationThreshold,
        autoRecoveryEnabled: p.autoRecoveryEnabled,
        description: p.description,
      })),
      total: DEFAULT_RECOVERY_POLICIES.length,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar políticas', 500, err);
  }
}
