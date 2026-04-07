/**
 * Graph Builder — Knowledge Graph & Relational Intelligence
 *
 * Constrói e atualiza o knowledge graph a partir dos dados existentes
 * no sistema. Lê entidades das tabelas transacionais e cria nós + arestas
 * no grafo.
 *
 * Fontes:
 *   - bookagent_campaigns       → nós Campaign + arestas BELONGS_TO
 *   - bookagent_publications    → nós Publication + arestas PUBLISHED_TO
 *   - bookagent_job_meta        → nós Output + arestas PRODUCED_BY
 *   - bookagent_job_artifacts   → arestas DERIVED_FROM
 *   - bookagent_tenant_memory   → nós MemoryPattern + arestas PREFERS
 *   - bookagent_goal_preferences→ nós Goal + arestas OPTIMIZED_FOR
 *
 * Persistência:
 *   - bookagent_knowledge_nodes
 *   - bookagent_knowledge_edges
 *
 * Parte 92: Knowledge Graph & Relational Intelligence
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  KnowledgeNode,
  KnowledgeEdge,
} from '../../domain/entities/knowledge-graph.js';
import {
  KnowledgeNodeType,
  RelationType,
  MIN_CONFIDENCE_TO_PERSIST,
} from '../../domain/entities/knowledge-graph.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const NODES_TABLE = 'bookagent_knowledge_nodes';
const EDGES_TABLE = 'bookagent_knowledge_edges';

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

export async function saveNode(
  node: KnowledgeNode,
  supabase: SupabaseClient,
): Promise<void> {
  await supabase.upsert(NODES_TABLE, {
    id: node.id,
    node_type: node.nodeType,
    entity_id: node.entityId,
    tenant_id: node.tenantId,
    label: node.label,
    metadata: JSON.stringify(node.metadata),
    created_at: node.createdAt,
    updated_at: node.updatedAt,
  }, 'id');
}

export async function saveEdge(
  edge: KnowledgeEdge,
  supabase: SupabaseClient,
): Promise<void> {
  await supabase.upsert(EDGES_TABLE, {
    id: edge.id,
    source_node_id: edge.sourceNodeId,
    target_node_id: edge.targetNodeId,
    relation_type: edge.relationType,
    weight: edge.weight,
    confidence: edge.confidence,
    tenant_id: edge.tenantId,
    metadata: JSON.stringify(edge.metadata),
    evidence: JSON.stringify(edge.evidence),
    created_at: edge.createdAt,
    updated_at: edge.updatedAt,
    expires_at: edge.expiresAt,
  }, 'id');
}

export async function saveBatchNodes(
  nodes: KnowledgeNode[],
  supabase: SupabaseClient,
): Promise<void> {
  for (const node of nodes) {
    await saveNode(node, supabase);
  }
}

export async function saveBatchEdges(
  edges: KnowledgeEdge[],
  supabase: SupabaseClient,
): Promise<void> {
  for (const edge of edges) {
    await saveEdge(edge, supabase);
  }
}

// ---------------------------------------------------------------------------
// Node Factory
// ---------------------------------------------------------------------------

function createNode(
  nodeType: KnowledgeNodeType,
  entityId: string,
  tenantId: string | null,
  label: string,
  metadata: Record<string, unknown> = {},
): KnowledgeNode {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    nodeType,
    entityId,
    tenantId,
    label,
    metadata,
    createdAt: now,
    updatedAt: now,
  };
}

function createEdge(
  sourceNodeId: string,
  targetNodeId: string,
  relationType: RelationType,
  weight: number,
  confidence: number,
  tenantId: string | null,
  evidence: string[] = [],
  metadata: Record<string, unknown> = {},
): KnowledgeEdge {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    sourceNodeId,
    targetNodeId,
    relationType,
    weight: Math.max(0, Math.min(100, weight)),
    confidence: Math.max(0, Math.min(100, confidence)),
    tenantId,
    metadata,
    evidence,
    createdAt: now,
    updatedAt: now,
    expiresAt: null,
  };
}

// ---------------------------------------------------------------------------
// Graph Building — Main Entry
// ---------------------------------------------------------------------------

export interface BuildResult {
  nodesCreated: number;
  edgesCreated: number;
  sources: string[];
  durationMs: number;
}

/**
 * Builds / refreshes the knowledge graph for a tenant.
 * Reads from transactional tables, creates nodes and infers edges.
 */
export async function buildTenantGraph(
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<BuildResult> {
  if (!supabase) {
    return { nodesCreated: 0, edgesCreated: 0, sources: [], durationMs: 0 };
  }

  const startMs = Date.now();
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];
  const sources: string[] = [];

  // Create tenant node
  const tenantNode = createNode(KnowledgeNodeType.TENANT, tenantId, tenantId, `Tenant ${tenantId}`);
  nodes.push(tenantNode);

  // Sync from each source
  const campaignResult = await syncCampaigns(tenantId, tenantNode.id, supabase);
  nodes.push(...campaignResult.nodes);
  edges.push(...campaignResult.edges);
  if (campaignResult.nodes.length > 0) sources.push('campaigns');

  const publicationResult = await syncPublications(tenantId, tenantNode.id, supabase);
  nodes.push(...publicationResult.nodes);
  edges.push(...publicationResult.edges);
  if (publicationResult.nodes.length > 0) sources.push('publications');

  const jobResult = await syncJobs(tenantId, tenantNode.id, supabase);
  nodes.push(...jobResult.nodes);
  edges.push(...jobResult.edges);
  if (jobResult.nodes.length > 0) sources.push('jobs');

  const goalResult = await syncGoals(tenantId, tenantNode.id, supabase);
  nodes.push(...goalResult.nodes);
  edges.push(...goalResult.edges);
  if (goalResult.nodes.length > 0) sources.push('goals');

  const memoryResult = await syncMemoryPatterns(tenantId, tenantNode.id, supabase);
  nodes.push(...memoryResult.nodes);
  edges.push(...memoryResult.edges);
  if (memoryResult.nodes.length > 0) sources.push('memory');

  // Infer cross-entity edges
  const inferredEdges = inferCrossEdges(nodes, tenantId);
  edges.push(...inferredEdges);

  // Filter out low-confidence edges
  const validEdges = edges.filter((e) => e.confidence >= MIN_CONFIDENCE_TO_PERSIST);

  // Persist
  await saveBatchNodes(nodes, supabase);
  await saveBatchEdges(validEdges, supabase);

  const durationMs = Date.now() - startMs;

  logger.info(
    `[GraphBuilder] Built graph for tenant=${tenantId}: ` +
    `${nodes.length} nodes, ${validEdges.length} edges, sources=[${sources.join(',')}] ` +
    `in ${durationMs}ms`,
  );

  return {
    nodesCreated: nodes.length,
    edgesCreated: validEdges.length,
    sources,
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Source Syncers
// ---------------------------------------------------------------------------

interface SyncResult {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

async function syncCampaigns(
  tenantId: string,
  tenantNodeId: string,
  supabase: SupabaseClient,
): Promise<SyncResult> {
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];

  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_campaigns', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'id,name,status,objective',
      limit: 200,
    });

    for (const row of rows) {
      const node = createNode(
        KnowledgeNodeType.CAMPAIGN,
        row['id'] as string,
        tenantId,
        (row['name'] as string) || `Campaign ${row['id']}`,
        { status: row['status'], objective: row['objective'] },
      );
      nodes.push(node);

      // Campaign → BELONGS_TO → Tenant
      edges.push(createEdge(
        node.id, tenantNodeId,
        RelationType.BELONGS_TO, 100, 100,
        tenantId,
        ['campaign ownership'],
      ));
    }
  } catch {
    // Table may not exist
  }

  return { nodes, edges };
}

async function syncPublications(
  tenantId: string,
  tenantNodeId: string,
  supabase: SupabaseClient,
): Promise<SyncResult> {
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];

  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_publications', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'id,platform,status,channel',
      limit: 200,
    });

    for (const row of rows) {
      const pubNode = createNode(
        KnowledgeNodeType.PUBLICATION,
        row['id'] as string,
        tenantId,
        `Publication ${row['platform'] ?? row['id']}`,
        { platform: row['platform'], status: row['status'] },
      );
      nodes.push(pubNode);

      // Publication → BELONGS_TO → Tenant
      edges.push(createEdge(
        pubNode.id, tenantNodeId,
        RelationType.BELONGS_TO, 100, 100,
        tenantId,
        ['publication ownership'],
      ));

      // If channel info exists, create Channel node + PUBLISHED_TO edge
      const channel = row['platform'] as string | undefined;
      if (channel) {
        const channelNode = createNode(
          KnowledgeNodeType.CHANNEL,
          `channel_${channel}`,
          tenantId,
          channel,
        );
        nodes.push(channelNode);

        edges.push(createEdge(
          pubNode.id, channelNode.id,
          RelationType.PUBLISHED_TO, 80, 90,
          tenantId,
          ['publication platform mapping'],
        ));
      }
    }
  } catch {
    // Graceful degradation
  }

  return { nodes, edges };
}

async function syncJobs(
  tenantId: string,
  tenantNodeId: string,
  supabase: SupabaseClient,
): Promise<SyncResult> {
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];

  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_job_meta', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'job_id,approval_status,created_at',
      limit: 200,
    });

    for (const row of rows) {
      const node = createNode(
        KnowledgeNodeType.OUTPUT,
        row['job_id'] as string,
        tenantId,
        `Job ${row['job_id']}`,
        { status: row['approval_status'] },
      );
      nodes.push(node);

      // Output → PRODUCED_BY → Tenant
      edges.push(createEdge(
        node.id, tenantNodeId,
        RelationType.PRODUCED_BY, 100, 100,
        tenantId,
        ['job ownership'],
      ));
    }
  } catch {
    // Graceful degradation
  }

  return { nodes, edges };
}

async function syncGoals(
  tenantId: string,
  tenantNodeId: string,
  supabase: SupabaseClient,
): Promise<SyncResult> {
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];

  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_goal_preferences', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'id,objective,aggressiveness',
      limit: 50,
    });

    for (const row of rows) {
      const node = createNode(
        KnowledgeNodeType.GOAL,
        row['id'] as string,
        tenantId,
        `Goal: ${row['objective'] ?? 'balanced'}`,
        { objective: row['objective'], aggressiveness: row['aggressiveness'] },
      );
      nodes.push(node);

      // Tenant → OPTIMIZED_FOR → Goal
      edges.push(createEdge(
        tenantNodeId, node.id,
        RelationType.OPTIMIZED_FOR, 85, 90,
        tenantId,
        ['tenant goal preference'],
      ));
    }
  } catch {
    // Graceful degradation
  }

  return { nodes, edges };
}

async function syncMemoryPatterns(
  tenantId: string,
  tenantNodeId: string,
  supabase: SupabaseClient,
): Promise<SyncResult> {
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];

  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_tenant_memory', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'id,patterns',
      limit: 10,
    });

    for (const row of rows) {
      let patterns: Array<Record<string, unknown>> = [];
      try {
        const raw = row['patterns'];
        patterns = typeof raw === 'string' ? JSON.parse(raw) : (raw as Array<Record<string, unknown>>) ?? [];
      } catch {
        patterns = [];
      }

      for (const pat of patterns) {
        const patKey = (pat['key'] as string) ?? uuid();
        const patValue = pat['value'] as string | undefined;
        const confidence = (pat['confidence'] as number) ?? 50;

        if (confidence < MIN_CONFIDENCE_TO_PERSIST) continue;

        const node = createNode(
          KnowledgeNodeType.MEMORY_PATTERN,
          patKey,
          tenantId,
          `Pattern: ${patKey}`,
          { value: patValue, confidence },
        );
        nodes.push(node);

        // Tenant → PREFERS → MemoryPattern (weight based on confidence)
        edges.push(createEdge(
          tenantNodeId, node.id,
          RelationType.PREFERS,
          Math.min(100, confidence),
          confidence,
          tenantId,
          ['memory pattern observation'],
        ));
      }
    }
  } catch {
    // Graceful degradation
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Cross-Entity Edge Inference
// ---------------------------------------------------------------------------

/**
 * Infers cross-entity edges from co-occurrence patterns.
 * E.g. if a campaign and a goal belong to the same tenant,
 * the campaign TARGETS the goal.
 */
function inferCrossEdges(
  nodes: KnowledgeNode[],
  tenantId: string,
): KnowledgeEdge[] {
  const edges: KnowledgeEdge[] = [];

  const campaigns = nodes.filter((n) => n.nodeType === KnowledgeNodeType.CAMPAIGN);
  const goals = nodes.filter((n) => n.nodeType === KnowledgeNodeType.GOAL);
  const outputs = nodes.filter((n) => n.nodeType === KnowledgeNodeType.OUTPUT);
  const publications = nodes.filter((n) => n.nodeType === KnowledgeNodeType.PUBLICATION);

  // Campaign → TARGETS → Goal (if both exist for tenant)
  for (const campaign of campaigns) {
    for (const goal of goals) {
      edges.push(createEdge(
        campaign.id, goal.id,
        RelationType.TARGETS, 60, 50,
        tenantId,
        ['inferred: campaign and goal share tenant'],
      ));
    }
  }

  // Output → SUPPORTS → Campaign (if both exist for tenant)
  for (const output of outputs.slice(0, 20)) {
    for (const campaign of campaigns.slice(0, 10)) {
      edges.push(createEdge(
        output.id, campaign.id,
        RelationType.SUPPORTS, 40, 35,
        tenantId,
        ['inferred: output and campaign share tenant'],
      ));
    }
  }

  // Publication → DERIVED_FROM → Output (weak inference for same tenant)
  for (const pub of publications.slice(0, 20)) {
    for (const output of outputs.slice(0, 10)) {
      edges.push(createEdge(
        pub.id, output.id,
        RelationType.DERIVED_FROM, 30, 25,
        tenantId,
        ['inferred: publication and output share tenant'],
      ));
    }
  }

  return edges;
}
