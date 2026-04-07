/**
 * Decision Controller — Decision Intelligence Layer
 *
 * POST /decisions/make           → Solicitar decisão
 * GET  /decisions/:id            → Detalhe de uma decisão
 * GET  /decisions                → Listar decisões do tenant
 * POST /decisions/:id/override   → Override humano
 * GET  /decisions/context        → Visualizar contexto decisório atual
 * GET  /decisions/pending        → Decisões pendentes de escalação
 *
 * Parte 94: Decision Intelligence Layer
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';
import {
  makeDecision,
  loadDecision,
  listDecisions,
  overrideDecision,
  collectContext,
} from '../../modules/decision-intelligence/index.js';
import type { DecisionRequest } from '../../modules/decision-intelligence/index.js';
import {
  DecisionType,
  DecisionCategory,
  DecisionStatus,
} from '../../domain/entities/decision.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForDecisions(client: SupabaseClientInstance): void {
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
 * POST /decisions/make — Solicitar decisão
 *
 * Body:
 *   type: DecisionType
 *   question: string
 *   entityId?: string
 *   params?: Record<string, unknown>
 */
export async function requestDecision(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { type, question, entityId, params } = req.body as {
      type?: string;
      question?: string;
      entityId?: string;
      params?: Record<string, unknown>;
    };

    if (!type || !question) {
      sendError(res, 'INVALID_INPUT', '"type" and "question" are required', 400);
      return;
    }

    const validTypes = Object.values(DecisionType) as string[];
    if (!validTypes.includes(type)) {
      sendError(res, 'INVALID_INPUT', `Invalid decision type. Valid: ${validTypes.join(', ')}`, 400);
      return;
    }

    const request: DecisionRequest = {
      type: type as DecisionType,
      question,
      entityId,
      params,
    };

    const record = await makeDecision(tenantCtx.tenantId, request, supabaseClient);
    sendSuccess(res, record, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar decisão', 500, err);
  }
}

/**
 * GET /decisions/:id — Detalhe de uma decisão
 */
export async function getDecision(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const record = await loadDecision(id, supabaseClient);

    if (!record) {
      sendError(res, 'NOT_FOUND', 'Decisão não encontrada', 404);
      return;
    }

    sendSuccess(res, record);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar decisão', 500, err);
  }
}

/**
 * GET /decisions — Listar decisões do tenant
 * Query: category?, limit?
 */
export async function listDecisionsEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const global = req.query['global'] === 'true';
    const tenantId = global ? null : tenantCtx.tenantId;
    const limit = req.query['limit'] ? Number(req.query['limit']) : 50;

    const categoryStr = req.query['category'] as string | undefined;
    const validCategories = Object.values(DecisionCategory) as string[];
    const category = categoryStr && validCategories.includes(categoryStr)
      ? (categoryStr as DecisionCategory)
      : undefined;

    const records = await listDecisions(tenantId, supabaseClient, category, limit);
    sendSuccess(res, { decisions: records, total: records.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar decisões', 500, err);
  }
}

/**
 * POST /decisions/:id/override — Override humano
 *
 * Body:
 *   overriddenBy: string
 *   newAnswer: string
 *   reason: string
 */
export async function overrideDecisionEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { overriddenBy, newAnswer, reason } = req.body as {
      overriddenBy?: string;
      newAnswer?: string;
      reason?: string;
    };

    if (!overriddenBy || !newAnswer || !reason) {
      sendError(res, 'INVALID_INPUT', '"overriddenBy", "newAnswer" and "reason" are required', 400);
      return;
    }

    const record = await overrideDecision(id, overriddenBy, newAnswer, reason, supabaseClient);

    if (!record) {
      sendError(res, 'NOT_FOUND', 'Decisão não encontrada ou não pode ser overridden', 404);
      return;
    }

    sendSuccess(res, record);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha no override', 500, err);
  }
}

/**
 * GET /decisions/context — Visualizar contexto decisório atual
 */
export async function getDecisionContext(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const context = await collectContext(tenantCtx.tenantId, supabaseClient);
    sendSuccess(res, context);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao coletar contexto decisório', 500, err);
  }
}

/**
 * GET /decisions/pending — Decisões pendentes de escalação
 */
export async function getPendingDecisions(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const global = req.query['global'] === 'true';
    const tenantId = global ? null : tenantCtx.tenantId;

    const all = await listDecisions(tenantId, supabaseClient, undefined, 100);
    const pending = all.filter(
      (d) => d.status === DecisionStatus.PENDING && d.requiresEscalation,
    );

    sendSuccess(res, { decisions: pending, total: pending.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar decisões pendentes', 500, err);
  }
}
