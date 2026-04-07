/**
 * Graph Intelligence — Knowledge Graph & Relational Intelligence
 *
 * Camada de inteligência relacional: detecta padrões, gera insights
 * e identifica oportunidades de otimização a partir do knowledge graph.
 *
 * Análises:
 *   - Padrões de preferência do tenant
 *   - Dependências críticas (single point of failure)
 *   - Oportunidades de canal não explorado
 *   - Anomalias de peso/confiança
 *   - Hub nodes (nós com muitas conexões)
 *
 * Parte 92: Knowledge Graph & Relational Intelligence
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  KnowledgeNode,
  KnowledgeEdge,
  RelationalInsight,
  RelationalPattern,
} from '../../domain/entities/knowledge-graph.js';
import {
  KnowledgeNodeType,
  RelationType,
  RelationalInsightCategory,
  RelationalInsightSeverity,
  STRONG_EDGE_THRESHOLD,
} from '../../domain/entities/knowledge-graph.js';
import { loadNodes, loadEdges, buildSnapshot } from './graph-query.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Main Intelligence Functions
// ---------------------------------------------------------------------------

export interface IntelligenceResult {
  insights: RelationalInsight[];
  patterns: RelationalPattern[];
  hubNodes: HubNodeInfo[];
  summary: string;
  generatedAt: string;
}

export interface HubNodeInfo {
  node: KnowledgeNode;
  connectionCount: number;
  avgEdgeWeight: number;
}

/**
 * Generates relational intelligence for a tenant.
 * Runs all analysis passes and returns consolidated insights.
 */
export async function generateIntelligence(
  tenantId: string | null,
  supabase: SupabaseClient | null,
): Promise<IntelligenceResult> {
  const emptyResult: IntelligenceResult = {
    insights: [],
    patterns: [],
    hubNodes: [],
    summary: 'No graph data available',
    generatedAt: new Date().toISOString(),
  };

  if (!supabase) return emptyResult;

  const nodes = await loadNodes(tenantId, supabase, undefined, 500);
  const edges = await loadEdges(tenantId, supabase, undefined, 500);

  if (nodes.length === 0) {
    return { ...emptyResult, summary: 'Graph is empty — run build first' };
  }

  const insights: RelationalInsight[] = [];

  // Analysis passes
  insights.push(...analyzePreferences(nodes, edges, tenantId));
  insights.push(...analyzeDependencies(nodes, edges, tenantId));
  insights.push(...analyzeOpportunities(nodes, edges, tenantId));
  insights.push(...analyzeAnomalies(edges, tenantId));

  // Hub node detection
  const hubNodes = detectHubNodes(nodes, edges);

  // Get patterns from snapshot
  const snapshot = await buildSnapshot(tenantId, supabase);

  // Summary
  const summary = buildSummary(nodes, edges, insights, hubNodes);

  logger.info(
    `[GraphIntelligence] tenant=${tenantId ?? 'global'}: ` +
    `${insights.length} insights, ${hubNodes.length} hubs, ` +
    `${snapshot.patterns.length} patterns`,
  );

  return {
    insights,
    patterns: snapshot.patterns,
    hubNodes,
    summary,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Analysis: Preferences
// ---------------------------------------------------------------------------

function analyzePreferences(
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  tenantId: string | null,
): RelationalInsight[] {
  const insights: RelationalInsight[] = [];

  // Strong preferences (PREFERS edges with high weight)
  const prefersEdges = edges.filter(
    (e) => e.relationType === RelationType.PREFERS && e.weight >= STRONG_EDGE_THRESHOLD,
  );

  if (prefersEdges.length >= 3) {
    const nodeIds = [...new Set(prefersEdges.map((e) => e.targetNodeId))];
    const preferredLabels = nodeIds
      .map((id) => nodes.find((n) => n.id === id)?.label)
      .filter(Boolean)
      .slice(0, 5);

    insights.push({
      id: uuid(),
      tenantId,
      title: 'Strong Preference Cluster',
      description: `Tenant shows strong preferences for ${prefersEdges.length} patterns: ${preferredLabels.join(', ')}`,
      category: RelationalInsightCategory.PREFERENCE,
      severity: RelationalInsightSeverity.SUGGESTION,
      relatedNodes: nodeIds.slice(0, 10),
      relatedEdges: prefersEdges.map((e) => e.id).slice(0, 10),
      evidence: prefersEdges.map((e) => `${e.relationType} weight=${e.weight}`).slice(0, 5),
      recommendation: 'Use these preferences to personalize content generation and template selection',
      generatedAt: new Date().toISOString(),
    });
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Analysis: Dependencies
// ---------------------------------------------------------------------------

function analyzeDependencies(
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  tenantId: string | null,
): RelationalInsight[] {
  const insights: RelationalInsight[] = [];

  // Find nodes that many others depend on (single point of failure)
  const dependsOnEdges = edges.filter((e) => e.relationType === RelationType.DEPENDS_ON);
  const targetCounts: Record<string, number> = {};

  for (const edge of dependsOnEdges) {
    targetCounts[edge.targetNodeId] = (targetCounts[edge.targetNodeId] ?? 0) + 1;
  }

  for (const [targetId, count] of Object.entries(targetCounts)) {
    if (count >= 3) {
      const targetNode = nodes.find((n) => n.id === targetId);
      insights.push({
        id: uuid(),
        tenantId,
        title: 'Critical Dependency Hub',
        description: `"${targetNode?.label ?? targetId}" has ${count} entities depending on it — potential single point of failure`,
        category: RelationalInsightCategory.DEPENDENCY,
        severity: count >= 5 ? RelationalInsightSeverity.IMPORTANT : RelationalInsightSeverity.SUGGESTION,
        relatedNodes: [targetId],
        relatedEdges: dependsOnEdges.filter((e) => e.targetNodeId === targetId).map((e) => e.id),
        evidence: [`${count} DEPENDS_ON edges targeting this node`],
        recommendation: 'Consider adding redundancy or fallback mechanisms for this critical node',
        generatedAt: new Date().toISOString(),
      });
    }
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Analysis: Opportunities
// ---------------------------------------------------------------------------

function analyzeOpportunities(
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  tenantId: string | null,
): RelationalInsight[] {
  const insights: RelationalInsight[] = [];

  // Opportunity: campaigns without goals
  const campaigns = nodes.filter((n) => n.nodeType === KnowledgeNodeType.CAMPAIGN);
  const targetEdges = edges.filter((e) => e.relationType === RelationType.TARGETS);
  const campaignsWithGoals = new Set(targetEdges.map((e) => e.sourceNodeId));

  const ungoaledCampaigns = campaigns.filter((c) => !campaignsWithGoals.has(c.id));
  if (ungoaledCampaigns.length > 0) {
    insights.push({
      id: uuid(),
      tenantId,
      title: 'Campaigns Without Goals',
      description: `${ungoaledCampaigns.length} campaign(s) have no explicit goal — optimization may be limited`,
      category: RelationalInsightCategory.OPPORTUNITY,
      severity: RelationalInsightSeverity.SUGGESTION,
      relatedNodes: ungoaledCampaigns.map((c) => c.id),
      relatedEdges: [],
      evidence: ungoaledCampaigns.map((c) => `Campaign "${c.label}" has no TARGETS edge`),
      recommendation: 'Link campaigns to optimization goals for better performance tracking',
      generatedAt: new Date().toISOString(),
    });
  }

  // Opportunity: few channels used
  const channels = nodes.filter((n) => n.nodeType === KnowledgeNodeType.CHANNEL);
  if (channels.length === 1) {
    insights.push({
      id: uuid(),
      tenantId,
      title: 'Single Channel Strategy',
      description: 'All publications go to a single channel — diversification may improve reach',
      category: RelationalInsightCategory.OPPORTUNITY,
      severity: RelationalInsightSeverity.INFO,
      relatedNodes: channels.map((c) => c.id),
      relatedEdges: [],
      evidence: [`Only ${channels.length} channel node in graph`],
      recommendation: 'Consider expanding to additional publication channels',
      generatedAt: new Date().toISOString(),
    });
  }

  // Opportunity: outputs not linked to any campaign
  const outputs = nodes.filter((n) => n.nodeType === KnowledgeNodeType.OUTPUT);
  const supportsEdges = edges.filter((e) => e.relationType === RelationType.SUPPORTS);
  const linkedOutputs = new Set(supportsEdges.map((e) => e.sourceNodeId));
  const orphanOutputs = outputs.filter((o) => !linkedOutputs.has(o.id));

  if (orphanOutputs.length >= 3) {
    insights.push({
      id: uuid(),
      tenantId,
      title: 'Orphan Outputs',
      description: `${orphanOutputs.length} output(s) are not linked to any campaign`,
      category: RelationalInsightCategory.OPPORTUNITY,
      severity: RelationalInsightSeverity.INFO,
      relatedNodes: orphanOutputs.map((o) => o.id).slice(0, 10),
      relatedEdges: [],
      evidence: [`${orphanOutputs.length} OUTPUT nodes without SUPPORTS edges`],
      recommendation: 'Consider organizing outputs into campaigns for better tracking',
      generatedAt: new Date().toISOString(),
    });
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Analysis: Anomalies
// ---------------------------------------------------------------------------

function analyzeAnomalies(
  edges: KnowledgeEdge[],
  tenantId: string | null,
): RelationalInsight[] {
  const insights: RelationalInsight[] = [];

  // Anomaly: BLOCKS edges with high weight
  const blockEdges = edges.filter(
    (e) => e.relationType === RelationType.BLOCKS && e.weight >= STRONG_EDGE_THRESHOLD,
  );

  if (blockEdges.length > 0) {
    insights.push({
      id: uuid(),
      tenantId,
      title: 'Strong Blocking Relations',
      description: `${blockEdges.length} blocking relation(s) with high weight detected — may indicate systemic issues`,
      category: RelationalInsightCategory.RISK,
      severity: RelationalInsightSeverity.IMPORTANT,
      relatedNodes: [
        ...new Set([
          ...blockEdges.map((e) => e.sourceNodeId),
          ...blockEdges.map((e) => e.targetNodeId),
        ]),
      ].slice(0, 10),
      relatedEdges: blockEdges.map((e) => e.id),
      evidence: blockEdges.map((e) => `BLOCKS edge weight=${e.weight}, confidence=${e.confidence}`),
      recommendation: 'Investigate and resolve blocking relations to improve system flow',
      generatedAt: new Date().toISOString(),
    });
  }

  // Anomaly: low confidence edges (may be stale)
  const lowConfEdges = edges.filter((e) => e.confidence < 25 && e.confidence > 0);
  if (lowConfEdges.length >= 10) {
    insights.push({
      id: uuid(),
      tenantId,
      title: 'Low Confidence Edge Cluster',
      description: `${lowConfEdges.length} edges have very low confidence (<25) — the graph may need rebuilding`,
      category: RelationalInsightCategory.ANOMALY,
      severity: RelationalInsightSeverity.INFO,
      relatedNodes: [],
      relatedEdges: lowConfEdges.map((e) => e.id).slice(0, 10),
      evidence: [`${lowConfEdges.length} edges with confidence < 25`],
      recommendation: 'Rebuild the tenant graph to refresh edge weights and confidence scores',
      generatedAt: new Date().toISOString(),
    });
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Hub Node Detection
// ---------------------------------------------------------------------------

function detectHubNodes(
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
): HubNodeInfo[] {
  // Count connections per node
  const connectionCount: Record<string, number> = {};
  const weightSum: Record<string, number> = {};

  for (const edge of edges) {
    connectionCount[edge.sourceNodeId] = (connectionCount[edge.sourceNodeId] ?? 0) + 1;
    connectionCount[edge.targetNodeId] = (connectionCount[edge.targetNodeId] ?? 0) + 1;
    weightSum[edge.sourceNodeId] = (weightSum[edge.sourceNodeId] ?? 0) + edge.weight;
    weightSum[edge.targetNodeId] = (weightSum[edge.targetNodeId] ?? 0) + edge.weight;
  }

  // Top hubs by connection count
  const hubs: HubNodeInfo[] = [];
  for (const node of nodes) {
    const count = connectionCount[node.id] ?? 0;
    if (count >= 3) {
      hubs.push({
        node,
        connectionCount: count,
        avgEdgeWeight: count > 0 ? Math.round((weightSum[node.id] ?? 0) / count) : 0,
      });
    }
  }

  hubs.sort((a, b) => b.connectionCount - a.connectionCount);
  return hubs.slice(0, 20);
}

// ---------------------------------------------------------------------------
// Summary Builder
// ---------------------------------------------------------------------------

function buildSummary(
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  insights: RelationalInsight[],
  hubs: HubNodeInfo[],
): string {
  const nodeTypes = new Set(nodes.map((n) => n.nodeType));
  const edgeTypes = new Set(edges.map((e) => e.relationType));
  const importantInsights = insights.filter(
    (i) => i.severity === RelationalInsightSeverity.IMPORTANT || i.severity === RelationalInsightSeverity.CRITICAL,
  );

  const parts: string[] = [
    `Graph: ${nodes.length} nodes (${nodeTypes.size} types), ${edges.length} edges (${edgeTypes.size} relation types).`,
  ];

  if (hubs.length > 0) {
    parts.push(`Top hub: "${hubs[0].node.label}" with ${hubs[0].connectionCount} connections.`);
  }

  if (importantInsights.length > 0) {
    parts.push(`${importantInsights.length} important insight(s) requiring attention.`);
  } else if (insights.length > 0) {
    parts.push(`${insights.length} insight(s) generated, none critical.`);
  }

  return parts.join(' ');
}
