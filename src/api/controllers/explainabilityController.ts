/**
 * Explainability Controller — Trust, Explanation & Audit Surfaces
 *
 * GET  /explainability/decision/:id     → Explicar decisão
 * GET  /explainability/job/:id          → Explicar job/pipeline
 * GET  /explainability/publication/:id  → Explicar publicação
 * GET  /explainability/list             → Listar explicações
 * GET  /audit/entity/:type/:id         → Audit surface por entidade
 * GET  /audit/campaign/:id             → Audit surface de campanha
 * GET  /audit/publication/:id          → Audit surface de publicação
 * GET  /trust/tenant                   → Trust signal do tenant
 * GET  /trust/entity/:type/:id         → Trust signal de entidade
 *
 * Parte 97: Trust, Explanation & Audit Surfaces
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';
import {
  explainDecision,
  explainJob,
  explainPublication,
  listExplanations,
  evaluateTenantTrust,
  evaluateEntityTrust,
  buildAuditSurface,
  buildCampaignAudit,
  buildPublicationAudit,
} from '../../modules/explainability/index.js';
import { ExplanationSubject } from '../../domain/entities/explainability.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForExplainability(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

// ============================================================================
// Helpers
// ============================================================================

function getTenantCtx(req: Request) {
  return req.tenantContext ?? createDefaultTenantContext();
}

// ============================================================================
// Explanation Endpoints
// ============================================================================

export async function getDecisionExplanation(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;
    const record = await explainDecision(tenantCtx.tenantId, id, supabaseClient);
    sendSuccess(res, record);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar explicação da decisão', 500, err);
  }
}

export async function getJobExplanation(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;
    const record = await explainJob(tenantCtx.tenantId, id, supabaseClient);
    sendSuccess(res, record);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar explicação do job', 500, err);
  }
}

export async function getPublicationExplanation(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;
    const record = await explainPublication(tenantCtx.tenantId, id, supabaseClient);
    sendSuccess(res, record);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar explicação da publicação', 500, err);
  }
}

export async function listExplanationsEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const global = req.query['global'] === 'true';
    const tenantId = global ? null : tenantCtx.tenantId;
    const limit = req.query['limit'] ? Number(req.query['limit']) : 50;

    const subjectStr = req.query['subject'] as string | undefined;
    const validSubjects = Object.values(ExplanationSubject) as string[];
    const subject = subjectStr && validSubjects.includes(subjectStr)
      ? (subjectStr as ExplanationSubject)
      : undefined;

    const records = await listExplanations(tenantId, supabaseClient, subject, limit);
    sendSuccess(res, { explanations: records, total: records.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar explicações', 500, err);
  }
}

// ============================================================================
// Audit Endpoints
// ============================================================================

export async function getEntityAudit(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { type, id } = req.params;
    const surface = await buildAuditSurface(tenantCtx.tenantId, id, type, supabaseClient);
    sendSuccess(res, surface);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar audit surface', 500, err);
  }
}

export async function getCampaignAudit(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;
    const surface = await buildCampaignAudit(tenantCtx.tenantId, id, supabaseClient);
    sendSuccess(res, surface);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar audit de campanha', 500, err);
  }
}

export async function getPublicationAudit(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { id } = req.params;
    const surface = await buildPublicationAudit(tenantCtx.tenantId, id, supabaseClient);
    sendSuccess(res, surface);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar audit de publicação', 500, err);
  }
}

// ============================================================================
// Trust Endpoints
// ============================================================================

export async function getTenantTrust(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const signal = await evaluateTenantTrust(tenantCtx.tenantId, supabaseClient);
    sendSuccess(res, signal);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao avaliar trust do tenant', 500, err);
  }
}

export async function getEntityTrust(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const { type, id } = req.params;
    const signal = await evaluateEntityTrust(tenantCtx.tenantId, id, type, supabaseClient);
    sendSuccess(res, signal);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao avaliar trust da entidade', 500, err);
  }
}
