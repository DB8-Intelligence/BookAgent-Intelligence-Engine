/**
 * Graph Query — Knowledge Graph & Relational Intelligence
 *
 * Motor de consulta do knowledge graph. Permite buscar nós,
 * arestas, relações fortes e construir snapshots da topologia.
 *
 * Operações:
 *   - getNodeRelations      → relações de/para um nó
 *   - queryByType           → filtrar por tipo de nó/relação
 *   - getStrongRelations    → relações com peso acima de threshold
 *   - findConnectedNodes    → nós conectados a um nó específico
 *   - buildSnapshot         → snapshot da topologia do grafo
 *
 * Parte 92: Knowledge Graph & Relational Intelligence
 */

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  KnowledgeNode,
  KnowledgeEdge,
  GraphSnapshot,
  GraphQueryResult,
  RelationalPattern,
} from '../../domain/entities/knowledge-graph.js';
import {
  KnowledgeNodeType,
  RelationType,
  STRONG_EDGE_THRESHOLD,
  WEAK_EDGE_THRESHOLD,
  DEFAULT_QUERY_LIMIT,
} from '../../domain/entities/knowledge-graph.js';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const NODES_TABLE = 'bookagent_knowledge_nodes';
const EDGES_TABLE = 'bookagent_knowledge_edges';

// ---------------------------------------------------------------------------
// Row Mappers
// ---------------------------------------------------------------------------

function mapRowToNode(row: Record<string, unknown>): KnowledgeNode {
  let metadata: Record<string, unknown> = {};
  try {
    const raw = row['metadata'];
    metadata = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>) ?? {};
  } catch {
    metadata = {};
  }

  return {
    id: row['id'] as string,
    nodeType: row['node_type'] as KnowledgeNodeType,
    entityId: row['entity_id'] as string,
    tenantId: (row['tenant_id'] as string) ?? null,
    label: (row['label'] as string) ?? '',
    metadata,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}

function mapRowToEdge(row: Record<string, unknown>): KnowledgeEdge {
  let metadata: Record<string, unknown> = {};
  let evidence: string[] = [];
  try {
    const rawMeta = row['metadata'];
    metadata = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : (rawMeta as Record<string, unknown>) ?? {};
  } catch {
    metadata = {};
  }
  try {
    const rawEv = row['evidence'];
    evidence = typeof rawEv === 'string' ? JSON.parse(rawEv) : (rawEv as string[]) ?? [];
  } catch {
    evidence = [];
  }

  return {
    id: row['id'] as string,
    sourceNodeId: row['source_node_id'] as string,
    targetNodeId: row['target_node_id'] as string,
    relationType: row['relation_type'] as RelationType,
    weight: row['weight'] as number,
    confidence: row['confidence'] as number,
    tenantId: (row['tenant_id'] as string) ?? null,
    metadata,
    evidence,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
    expiresAt: (row['expires_at'] as string) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Load Helpers
// ---------------------------------------------------------------------------

export async function loadNodes(
  tenantId: string | null,
  supabase: SupabaseClient,
  nodeType?: KnowledgeNodeType,
  limit?: number,
): Promise<KnowledgeNode[]> {
  type Filter = { column: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'in'; value: string | number | boolean | null };
  const filters: Filter[] = [];

  if (tenantId) {
    filters.push({ column: 'tenant_id', operator: 'eq', value: tenantId });
  }
  if (nodeType) {
    filters.push({ column: 'node_type', operator: 'eq', value: nodeType });
  }

  const rows = await supabase.select<Record<string, unknown>>(NODES_TABLE, {
    filters,
    limit: limit ?? DEFAULT_QUERY_LIMIT,
    orderBy: 'created_at',
    orderDesc: true,
  });

  return rows.map(mapRowToNode);
}

export async function loadEdges(
  tenantId: string | null,
  supabase: SupabaseClient,
  relationType?: RelationType,
  limit?: number,
): Promise<KnowledgeEdge[]> {
  type Filter = { column: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'in'; value: string | number | boolean | null };
  const filters: Filter[] = [];

  if (tenantId) {
    filters.push({ column: 'tenant_id', operator: 'eq', value: tenantId });
  }
  if (relationType) {
    filters.push({ column: 'relation_type', operator: 'eq', value: relationType });
  }

  const rows = await supabase.select<Record<string, unknown>>(EDGES_TABLE, {
    filters,
    limit: limit ?? DEFAULT_QUERY_LIMIT,
    orderBy: 'weight',
    orderDesc: true,
  });

  return rows.map(mapRowToEdge);
}

// ---------------------------------------------------------------------------
// Query Operations
// ---------------------------------------------------------------------------

/**
 * Gets all relations (edges) connected to a specific node.
 */
export async function getNodeRelations(
  nodeId: string,
  supabase: SupabaseClient | null,
): Promise<KnowledgeEdge[]> {
  if (!supabase) return [];

  const outgoing = await supabase.select<Record<string, unknown>>(EDGES_TABLE, {
    filters: [{ column: 'source_node_id', operator: 'eq', value: nodeId }],
    limit: DEFAULT_QUERY_LIMIT,
    orderBy: 'weight',
    orderDesc: true,
  });

  const incoming = await supabase.select<Record<string, unknown>>(EDGES_TABLE, {
    filters: [{ column: 'target_node_id', operator: 'eq', value: nodeId }],
    limit: DEFAULT_QUERY_LIMIT,
    orderBy: 'weight',
    orderDesc: true,
  });

  const allRows = [...outgoing, ...incoming];

  // Deduplicate by id
  const seen = new Set<string>();
  const unique: Record<string, unknown>[] = [];
  for (const row of allRows) {
    const id = row['id'] as string;
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(row);
    }
  }

  return unique.map(mapRowToEdge);
}

/**
 * Queries the graph filtering by node type and/or relation type.
 */
export async function queryByType(
  tenantId: string | null,
  supabase: SupabaseClient | null,
  nodeType?: KnowledgeNodeType,
  relationType?: RelationType,
): Promise<GraphQueryResult> {
  if (!supabase) {
    return { nodes: [], edges: [], totalNodes: 0, totalEdges: 0 };
  }

  const nodes = await loadNodes(tenantId, supabase, nodeType);
  const edges = await loadEdges(tenantId, supabase, relationType);

  return {
    nodes,
    edges,
    totalNodes: nodes.length,
    totalEdges: edges.length,
  };
}

/**
 * Returns edges with weight above the strong threshold.
 */
export async function getStrongRelations(
  tenantId: string | null,
  supabase: SupabaseClient | null,
  minWeight?: number,
): Promise<KnowledgeEdge[]> {
  if (!supabase) return [];

  const threshold = minWeight ?? STRONG_EDGE_THRESHOLD;
  const edges = await loadEdges(tenantId, supabase);

  return edges.filter((e) => e.weight >= threshold);
}

/**
 * Finds all nodes directly connected to a given node.
 */
export async function findConnectedNodes(
  nodeId: string,
  supabase: SupabaseClient | null,
): Promise<KnowledgeNode[]> {
  if (!supabase) return [];

  const edges = await getNodeRelations(nodeId, supabase);

  // Collect connected node IDs
  const connectedIds = new Set<string>();
  for (const edge of edges) {
    if (edge.sourceNodeId !== nodeId) connectedIds.add(edge.sourceNodeId);
    if (edge.targetNodeId !== nodeId) connectedIds.add(edge.targetNodeId);
  }

  // Load connected nodes
  const nodes: KnowledgeNode[] = [];
  for (const id of connectedIds) {
    try {
      const rows = await supabase.select<Record<string, unknown>>(NODES_TABLE, {
        filters: [{ column: 'id', operator: 'eq', value: id }],
        limit: 1,
      });
      if (rows.length > 0) {
        nodes.push(mapRowToNode(rows[0]));
      }
    } catch {
      // Skip unavailable nodes
    }
  }

  return nodes;
}

/**
 * Finds a node by its entity ID and type.
 */
export async function findNodeByEntity(
  entityId: string,
  nodeType: KnowledgeNodeType,
  tenantId: string | null,
  supabase: SupabaseClient | null,
): Promise<KnowledgeNode | null> {
  if (!supabase) return null;

  type Filter = { column: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'in'; value: string | number | boolean | null };
  const filters: Filter[] = [
    { column: 'entity_id', operator: 'eq', value: entityId },
    { column: 'node_type', operator: 'eq', value: nodeType },
  ];
  if (tenantId) {
    filters.push({ column: 'tenant_id', operator: 'eq', value: tenantId });
  }

  const rows = await supabase.select<Record<string, unknown>>(NODES_TABLE, {
    filters,
    limit: 1,
  });

  return rows.length > 0 ? mapRowToNode(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Graph Snapshot
// ---------------------------------------------------------------------------

/**
 * Builds a point-in-time snapshot of the graph topology.
 */
export async function buildSnapshot(
  tenantId: string | null,
  supabase: SupabaseClient | null,
): Promise<GraphSnapshot> {
  const emptySnapshot: GraphSnapshot = {
    tenantId,
    totalNodes: 0,
    totalEdges: 0,
    nodesByType: {},
    edgesByType: {},
    avgWeight: 0,
    avgConfidence: 0,
    strongEdges: 0,
    weakEdges: 0,
    patterns: [],
    generatedAt: new Date().toISOString(),
  };

  if (!supabase) return emptySnapshot;

  const nodes = await loadNodes(tenantId, supabase, undefined, 500);
  const edges = await loadEdges(tenantId, supabase, undefined, 500);

  if (nodes.length === 0 && edges.length === 0) return emptySnapshot;

  // Aggregate nodes by type
  const nodesByType: Record<string, number> = {};
  for (const node of nodes) {
    nodesByType[node.nodeType] = (nodesByType[node.nodeType] ?? 0) + 1;
  }

  // Aggregate edges by type
  const edgesByType: Record<string, number> = {};
  let totalWeight = 0;
  let totalConfidence = 0;
  let strongCount = 0;
  let weakCount = 0;

  for (const edge of edges) {
    edgesByType[edge.relationType] = (edgesByType[edge.relationType] ?? 0) + 1;
    totalWeight += edge.weight;
    totalConfidence += edge.confidence;
    if (edge.weight >= STRONG_EDGE_THRESHOLD) strongCount++;
    if (edge.weight <= WEAK_EDGE_THRESHOLD) weakCount++;
  }

  // Detect basic patterns
  const patterns = detectBasicPatterns(nodes, edges, tenantId);

  return {
    tenantId,
    totalNodes: nodes.length,
    totalEdges: edges.length,
    nodesByType,
    edgesByType,
    avgWeight: edges.length > 0 ? Math.round(totalWeight / edges.length) : 0,
    avgConfidence: edges.length > 0 ? Math.round(totalConfidence / edges.length) : 0,
    strongEdges: strongCount,
    weakEdges: weakCount,
    patterns,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Basic Pattern Detection
// ---------------------------------------------------------------------------

function detectBasicPatterns(
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  tenantId: string | null,
): RelationalPattern[] {
  const patterns: RelationalPattern[] = [];

  // Pattern: Heavy publisher — many publications connected to channels
  const pubNodes = nodes.filter((n) => n.nodeType === KnowledgeNodeType.PUBLICATION);
  const channelNodes = nodes.filter((n) => n.nodeType === KnowledgeNodeType.CHANNEL);
  const pubToChannelEdges = edges.filter((e) => e.relationType === RelationType.PUBLISHED_TO);

  if (pubToChannelEdges.length >= 3 && channelNodes.length >= 2) {
    const avgW = pubToChannelEdges.reduce((s, e) => s + e.weight, 0) / pubToChannelEdges.length;
    patterns.push({
      id: `pattern_heavy_publisher_${tenantId ?? 'global'}`,
      name: 'Heavy Publisher',
      description: `Tenant publishes actively across ${channelNodes.length} channels with ${pubNodes.length} publications`,
      nodeTypes: [KnowledgeNodeType.PUBLICATION, KnowledgeNodeType.CHANNEL],
      relationTypes: [RelationType.PUBLISHED_TO],
      frequency: pubToChannelEdges.length,
      avgWeight: Math.round(avgW),
      tenantId,
      detectedAt: new Date().toISOString(),
    });
  }

  // Pattern: Goal-driven — goals connected to campaigns
  const goalEdges = edges.filter((e) => e.relationType === RelationType.TARGETS);
  const campaignNodes = nodes.filter((n) => n.nodeType === KnowledgeNodeType.CAMPAIGN);
  const goalNodes = nodes.filter((n) => n.nodeType === KnowledgeNodeType.GOAL);

  if (goalEdges.length >= 1 && campaignNodes.length >= 1 && goalNodes.length >= 1) {
    const avgW = goalEdges.reduce((s, e) => s + e.weight, 0) / goalEdges.length;
    patterns.push({
      id: `pattern_goal_driven_${tenantId ?? 'global'}`,
      name: 'Goal-Driven Campaigns',
      description: `${campaignNodes.length} campaigns targeting ${goalNodes.length} goals`,
      nodeTypes: [KnowledgeNodeType.CAMPAIGN, KnowledgeNodeType.GOAL],
      relationTypes: [RelationType.TARGETS],
      frequency: goalEdges.length,
      avgWeight: Math.round(avgW),
      tenantId,
      detectedAt: new Date().toISOString(),
    });
  }

  // Pattern: Memory-informed — memory patterns influencing preferences
  const memoryNodes = nodes.filter((n) => n.nodeType === KnowledgeNodeType.MEMORY_PATTERN);
  const prefersEdges = edges.filter((e) => e.relationType === RelationType.PREFERS);

  if (memoryNodes.length >= 3 && prefersEdges.length >= 3) {
    const avgW = prefersEdges.reduce((s, e) => s + e.weight, 0) / prefersEdges.length;
    patterns.push({
      id: `pattern_memory_informed_${tenantId ?? 'global'}`,
      name: 'Memory-Informed Preferences',
      description: `${memoryNodes.length} memory patterns shaping tenant preferences`,
      nodeTypes: [KnowledgeNodeType.MEMORY_PATTERN],
      relationTypes: [RelationType.PREFERS],
      frequency: prefersEdges.length,
      avgWeight: Math.round(avgW),
      tenantId,
      detectedAt: new Date().toISOString(),
    });
  }

  return patterns;
}
