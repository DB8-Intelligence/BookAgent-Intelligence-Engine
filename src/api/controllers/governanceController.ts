/**
 * Governance Controller — Human-in-the-Loop Governance
 *
 * GET  /governance/policy                       → Política do tenant
 * GET  /governance/checkpoints                  → Listar checkpoints
 * GET  /governance/checkpoints/pending           → Checkpoints pendentes
 * GET  /governance/checkpoints/:id               → Detalhe do checkpoint
 * POST /governance/checkpoints/:id/approve       → Aprovar checkpoint
 * POST /governance/checkpoints/:id/reject        → Rejeitar checkpoint
 * POST /governance/checkpoints/:id/override      → Override com justificativa
 *
 * Todos tenant-scoped via tenantGuard.
 *
 * Parte 88: Human-in-the-Loop Governance
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';
import {
  getPolicy,
  listCheckpoints,
  getCheckpoint,
  resolveCheckpoint,
  createOverride,
} from '../../modules/governance/index.js';
import { GovernanceDecisionResult } from '../../domain/entities/governance.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForGovernance(client: SupabaseClientInstance): void {
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
 * GET /governance/policy — Política de governança do tenant
 */
export async function getGovernancePolicy(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const policy = getPolicy(tenantCtx);
    sendSuccess(res, policy);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar política', 500, err);
  }
}

/**
 * GET /governance/checkpoints — Listar todos os checkpoints
 */
export async function listGovernanceCheckpoints(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const checkpoints = await listCheckpoints(tenantCtx.tenantId, null, supabaseClient);

    sendSuccess(res, {
      checkpoints,
      total: checkpoints.length,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar checkpoints', 500, err);
  }
}

/**
 * GET /governance/checkpoints/pending — Checkpoints pendentes
 */
export async function listPendingCheckpoints(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const checkpoints = await listCheckpoints(
      tenantCtx.tenantId,
      GovernanceDecisionResult.PENDING,
      supabaseClient,
    );

    sendSuccess(res, {
      checkpoints,
      total: checkpoints.length,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar checkpoints pendentes', 500, err);
  }
}

/**
 * GET /governance/checkpoints/:id — Detalhe do checkpoint
 */
export async function getGovernanceCheckpoint(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;

    const checkpoint = await getCheckpoint(id!, tenantCtx.tenantId, supabaseClient);
    if (!checkpoint) {
      sendError(res, 'NOT_FOUND', 'Checkpoint não encontrado', 404);
      return;
    }

    sendSuccess(res, checkpoint);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar checkpoint', 500, err);
  }
}

/**
 * POST /governance/checkpoints/:id/approve — Aprovar checkpoint
 */
export async function approveCheckpoint(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;
    const { decidedBy, justification } = req.body as {
      decidedBy?: string;
      justification?: string;
    };

    if (!decidedBy) {
      sendError(res, 'INVALID_INPUT', 'decidedBy é obrigatório', 400);
      return;
    }

    const result = await resolveCheckpoint(
      id!,
      tenantCtx.tenantId,
      {
        result: GovernanceDecisionResult.APPROVED,
        decidedBy,
        justification: justification ?? 'Aprovado',
        decidedAt: new Date().toISOString(),
      },
      supabaseClient,
    );

    if (!result) {
      sendError(res, 'NOT_FOUND', 'Checkpoint não encontrado', 404);
      return;
    }

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao aprovar', 500, err);
  }
}

/**
 * POST /governance/checkpoints/:id/reject — Rejeitar checkpoint
 */
export async function rejectCheckpoint(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;
    const { decidedBy, justification } = req.body as {
      decidedBy?: string;
      justification?: string;
    };

    if (!decidedBy) {
      sendError(res, 'INVALID_INPUT', 'decidedBy é obrigatório', 400);
      return;
    }

    const result = await resolveCheckpoint(
      id!,
      tenantCtx.tenantId,
      {
        result: GovernanceDecisionResult.REJECTED,
        decidedBy,
        justification: justification ?? 'Rejeitado',
        decidedAt: new Date().toISOString(),
      },
      supabaseClient,
    );

    if (!result) {
      sendError(res, 'NOT_FOUND', 'Checkpoint não encontrado', 404);
      return;
    }

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao rejeitar', 500, err);
  }
}

/**
 * POST /governance/checkpoints/:id/override — Override com justificativa
 */
export async function overrideCheckpoint(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;
    const { overriddenBy, justification } = req.body as {
      overriddenBy?: string;
      justification?: string;
    };

    if (!overriddenBy || !justification) {
      sendError(res, 'INVALID_INPUT', 'overriddenBy e justification são obrigatórios', 400);
      return;
    }

    const override = await createOverride(
      id!,
      tenantCtx.tenantId,
      overriddenBy,
      justification,
      supabaseClient,
    );

    if (!override) {
      sendError(res, 'NOT_FOUND', 'Checkpoint não encontrado', 404);
      return;
    }

    sendSuccess(res, override);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao criar override', 500, err);
  }
}
