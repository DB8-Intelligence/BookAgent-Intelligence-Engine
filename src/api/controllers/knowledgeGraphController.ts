/**
 * Knowledge Graph Controller — Knowledge Graph & Relational Intelligence
 *
 * GET  /knowledge-graph/snapshot     → Snapshot da topologia do grafo
 * POST /knowledge-graph/build        → Construir/atualizar grafo do tenant
 * GET  /knowledge-graph/nodes        → Listar nós (filtráveis por tipo)
 * GET  /knowledge-graph/edges        → Listar arestas (filtráveis por tipo)
 * GET  /knowledge-graph/nodes/:nodeId/relations → Relações de um nó
 * GET  /knowledge-graph/nodes/:nodeId/connected → Nós conectados
 * GET  /knowledge-graph/strong       → Relações fortes
 * GET  /knowledge-graph/intelligence → Inteligência relacional
 *
 * Parte 92: Knowledge Graph & Relational Intelligence
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';
import {
  buildTenantGraph,
  loadNodes,
  loadEdges,
  getNodeRelations,
  findConnectedNodes,
  getStrongRelations,
  buildSnapshot,
  generateIntelligence,
} from '../../modules/knowledge-graph/index.js';
import {
  KnowledgeNodeType,
  RelationType,
} from '../../domain/entities/knowledge-graph.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForKnowledgeGraph(client: SupabaseClientInstance): void {
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
 * GET /knowledge-graph/snapshot — Snapshot da topologia do grafo
 */
export async function getGraphSnapshot(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const global = req.query['global'] === 'true';
    const tenantId = global ? null : tenantCtx.tenantId;

    const snapshot = await buildSnapshot(tenantId, supabaseClient);
    sendSuccess(res, snapshot);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar snapshot do grafo', 500, err);
  }
}

/**
 * POST /knowledge-graph/build — Construir/atualizar grafo do tenant
 */
export async function buildGraph(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const result = await buildTenantGraph(tenantCtx.tenantId, supabaseClient);
    sendSuccess(res, result, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao construir grafo', 500, err);
  }
}

/**
 * GET /knowledge-graph/nodes — Listar nós
 * Query params: type (KnowledgeNodeType), limit
 */
export async function listNodes(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const global = req.query['global'] === 'true';
    const tenantId = global ? null : tenantCtx.tenantId;

    const nodeType = req.query['type'] as string | undefined;
    const limit = req.query['limit'] ? Number(req.query['limit']) : undefined;

    const validNodeType = Object.values(KnowledgeNodeType).includes(nodeType as KnowledgeNodeType)
      ? (nodeType as KnowledgeNodeType)
      : undefined;

    if (!supabaseClient) {
      sendSuccess(res, { nodes: [], total: 0 });
      return;
    }

    const nodes = await loadNodes(tenantId, supabaseClient, validNodeType, limit);

    sendSuccess(res, { nodes, total: nodes.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar nós', 500, err);
  }
}

/**
 * GET /knowledge-graph/edges — Listar arestas
 * Query params: type (RelationType), limit
 */
export async function listEdges(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const global = req.query['global'] === 'true';
    const tenantId = global ? null : tenantCtx.tenantId;

    const relType = req.query['type'] as string | undefined;
    const limit = req.query['limit'] ? Number(req.query['limit']) : undefined;

    const validRelType = Object.values(RelationType).includes(relType as RelationType)
      ? (relType as RelationType)
      : undefined;

    if (!supabaseClient) {
      sendSuccess(res, { edges: [], total: 0 });
      return;
    }

    const edges = await loadEdges(tenantId, supabaseClient, validRelType, limit);

    sendSuccess(res, { edges, total: edges.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao listar arestas', 500, err);
  }
}

/**
 * GET /knowledge-graph/nodes/:nodeId/relations — Relações de um nó
 */
export async function getRelations(req: Request, res: Response): Promise<void> {
  try {
    const { nodeId } = req.params;
    const edges = await getNodeRelations(nodeId, supabaseClient);

    sendSuccess(res, { nodeId, relations: edges, total: edges.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar relações', 500, err);
  }
}

/**
 * GET /knowledge-graph/nodes/:nodeId/connected — Nós conectados
 */
export async function getConnected(req: Request, res: Response): Promise<void> {
  try {
    const { nodeId } = req.params;
    const nodes = await findConnectedNodes(nodeId, supabaseClient);

    sendSuccess(res, { nodeId, connectedNodes: nodes, total: nodes.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar nós conectados', 500, err);
  }
}

/**
 * GET /knowledge-graph/strong — Relações fortes
 * Query params: minWeight
 */
export async function getStrong(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const global = req.query['global'] === 'true';
    const tenantId = global ? null : tenantCtx.tenantId;
    const minWeight = req.query['minWeight'] ? Number(req.query['minWeight']) : undefined;

    const edges = await getStrongRelations(tenantId, supabaseClient, minWeight);

    sendSuccess(res, { strongRelations: edges, total: edges.length, minWeight: minWeight ?? 70 });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar relações fortes', 500, err);
  }
}

/**
 * GET /knowledge-graph/intelligence — Inteligência relacional
 */
export async function getIntelligence(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const global = req.query['global'] === 'true';
    const tenantId = global ? null : tenantCtx.tenantId;

    const result = await generateIntelligence(tenantId, supabaseClient);

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar inteligência relacional', 500, err);
  }
}
