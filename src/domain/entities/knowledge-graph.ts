/**
 * Knowledge Graph & Relational Intelligence — Domain Entities
 *
 * Modela um grafo de conhecimento sobre as entidades do BookAgent,
 * representando relações semânticas e permitindo inteligência relacional.
 *
 * Conceitos:
 *   - KnowledgeNode  — vértice do grafo, mapeado 1:1 a uma entidade do sistema
 *   - KnowledgeEdge  — aresta ponderada entre nós, com tipo de relação e confiança
 *   - RelationType    — semântica da aresta (uses, prefers, correlates_with, etc.)
 *   - RelationalPattern — padrão recorrente detectado no grafo
 *   - GraphSnapshot   — visão point-in-time da topologia do grafo
 *   - RelationalInsight — insight derivado da análise relacional
 *
 * Persistência:
 *   - bookagent_knowledge_nodes
 *   - bookagent_knowledge_edges
 *
 * Parte 92: Knowledge Graph & Relational Intelligence
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Tipos de nó — cada um corresponde a uma entidade raiz do sistema. */
export enum KnowledgeNodeType {
  TENANT     = 'tenant',
  BOOK       = 'book',
  ASSET      = 'asset',
  SOURCE     = 'source',
  OUTPUT     = 'output',
  VARIANT    = 'variant',
  PRESET     = 'preset',
  TEMPLATE   = 'template',
  CAMPAIGN   = 'campaign',
  GOAL       = 'goal',
  CHANNEL    = 'channel',
  PUBLICATION = 'publication',
  REVIEW_PATTERN  = 'review_pattern',
  MEMORY_PATTERN  = 'memory_pattern',
  LEARNING_RULE   = 'learning_rule',
  STRATEGY   = 'strategy',
  SCHEDULE   = 'schedule',
}

/** Tipos de relação semântica entre nós. */
export enum RelationType {
  /** A usa B */
  USES                  = 'uses',
  /** A prefere B */
  PREFERS               = 'prefers',
  /** A performa melhor com B */
  PERFORMS_BETTER_WITH   = 'performs_better_with',
  /** A correlaciona-se com B */
  CORRELATES_WITH       = 'correlates_with',
  /** A suporta B */
  SUPPORTS              = 'supports',
  /** A bloqueia B */
  BLOCKS                = 'blocks',
  /** A depende de B */
  DEPENDS_ON            = 'depends_on',
  /** A publicado em B (canal) */
  PUBLISHED_TO          = 'published_to',
  /** A revisado por B (padrão de review) */
  REVIEWED_BY           = 'reviewed_by',
  /** A otimizado para B (goal) */
  OPTIMIZED_FOR         = 'optimized_for',
  /** A derivado de B */
  DERIVED_FROM          = 'derived_from',
  /** A pertence a B */
  BELONGS_TO            = 'belongs_to',
  /** A produzido por B */
  PRODUCED_BY           = 'produced_by',
  /** A direciona / mira B */
  TARGETS               = 'targets',
}

/** Categoria de insight relacional. */
export enum RelationalInsightCategory {
  PERFORMANCE  = 'performance',
  PREFERENCE   = 'preference',
  DEPENDENCY   = 'dependency',
  OPPORTUNITY  = 'opportunity',
  RISK         = 'risk',
  ANOMALY      = 'anomaly',
}

/** Severidade de insight relacional. */
export enum RelationalInsightSeverity {
  INFO       = 'info',
  SUGGESTION = 'suggestion',
  IMPORTANT  = 'important',
  CRITICAL   = 'critical',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Nó do knowledge graph — mapeia 1:1 a uma entidade do sistema. */
export interface KnowledgeNode {
  id: string;
  nodeType: KnowledgeNodeType;
  /** ID da entidade no sistema (job_id, campaign_id, etc.) */
  entityId: string;
  tenantId: string | null;
  /** Label legível para exibição */
  label: string;
  /** Metadados extras do nó (opcionais) */
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Aresta do knowledge graph — relação ponderada entre dois nós. */
export interface KnowledgeEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: RelationType;
  /** Peso da relação (0–100), indica força/importância */
  weight: number;
  /** Confiança da inferência (0–100) */
  confidence: number;
  tenantId: string | null;
  /** Metadados extras da aresta */
  metadata: Record<string, unknown>;
  /** Evidências que suportam esta relação */
  evidence: string[];
  createdAt: string;
  updatedAt: string;
  /** Data de expiração (para relações temporais) */
  expiresAt: string | null;
}

/** Padrão relacional detectado no grafo. */
export interface RelationalPattern {
  id: string;
  name: string;
  description: string;
  /** Tipos de nó envolvidos no padrão */
  nodeTypes: KnowledgeNodeType[];
  /** Tipos de relação envolvidos */
  relationTypes: RelationType[];
  /** Frequência de ocorrência */
  frequency: number;
  /** Peso médio das arestas no padrão */
  avgWeight: number;
  tenantId: string | null;
  detectedAt: string;
}

/** Snapshot point-in-time da topologia do grafo. */
export interface GraphSnapshot {
  tenantId: string | null;
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
  avgWeight: number;
  avgConfidence: number;
  strongEdges: number;
  weakEdges: number;
  patterns: RelationalPattern[];
  generatedAt: string;
}

/** Resultado de uma consulta ao grafo. */
export interface GraphQueryResult {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  totalNodes: number;
  totalEdges: number;
}

/** Insight derivado da análise relacional do grafo. */
export interface RelationalInsight {
  id: string;
  tenantId: string | null;
  title: string;
  description: string;
  category: RelationalInsightCategory;
  severity: RelationalInsightSeverity;
  relatedNodes: string[];
  relatedEdges: string[];
  evidence: string[];
  recommendation: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Peso mínimo para considerar uma relação "forte". */
export const STRONG_EDGE_THRESHOLD = 70;

/** Peso máximo para considerar uma relação "fraca". */
export const WEAK_EDGE_THRESHOLD = 30;

/** Confiança mínima para persistir uma aresta inferida. */
export const MIN_CONFIDENCE_TO_PERSIST = 20;

/** Limite de nós retornados em queries por padrão. */
export const DEFAULT_QUERY_LIMIT = 200;

/** Labels dos tipos de nó. */
export const NODE_TYPE_LABELS: Record<KnowledgeNodeType, string> = {
  [KnowledgeNodeType.TENANT]:          'Tenant',
  [KnowledgeNodeType.BOOK]:            'Book',
  [KnowledgeNodeType.ASSET]:           'Asset',
  [KnowledgeNodeType.SOURCE]:          'Source',
  [KnowledgeNodeType.OUTPUT]:          'Output',
  [KnowledgeNodeType.VARIANT]:         'Variant',
  [KnowledgeNodeType.PRESET]:          'Preset',
  [KnowledgeNodeType.TEMPLATE]:        'Template',
  [KnowledgeNodeType.CAMPAIGN]:        'Campaign',
  [KnowledgeNodeType.GOAL]:            'Goal',
  [KnowledgeNodeType.CHANNEL]:         'Channel',
  [KnowledgeNodeType.PUBLICATION]:     'Publication',
  [KnowledgeNodeType.REVIEW_PATTERN]:  'Review Pattern',
  [KnowledgeNodeType.MEMORY_PATTERN]:  'Memory Pattern',
  [KnowledgeNodeType.LEARNING_RULE]:   'Learning Rule',
  [KnowledgeNodeType.STRATEGY]:        'Strategy',
  [KnowledgeNodeType.SCHEDULE]:        'Schedule',
};

/** Labels dos tipos de relação. */
export const RELATION_TYPE_LABELS: Record<RelationType, string> = {
  [RelationType.USES]:                 'Uses',
  [RelationType.PREFERS]:              'Prefers',
  [RelationType.PERFORMS_BETTER_WITH]:  'Performs Better With',
  [RelationType.CORRELATES_WITH]:      'Correlates With',
  [RelationType.SUPPORTS]:             'Supports',
  [RelationType.BLOCKS]:               'Blocks',
  [RelationType.DEPENDS_ON]:           'Depends On',
  [RelationType.PUBLISHED_TO]:         'Published To',
  [RelationType.REVIEWED_BY]:          'Reviewed By',
  [RelationType.OPTIMIZED_FOR]:        'Optimized For',
  [RelationType.DERIVED_FROM]:         'Derived From',
  [RelationType.BELONGS_TO]:           'Belongs To',
  [RelationType.PRODUCED_BY]:          'Produced By',
  [RelationType.TARGETS]:              'Targets',
};

/** Labels de categoria de insight. */
export const INSIGHT_CATEGORY_LABELS: Record<RelationalInsightCategory, string> = {
  [RelationalInsightCategory.PERFORMANCE]:  'Performance',
  [RelationalInsightCategory.PREFERENCE]:   'Preference',
  [RelationalInsightCategory.DEPENDENCY]:   'Dependency',
  [RelationalInsightCategory.OPPORTUNITY]:  'Opportunity',
  [RelationalInsightCategory.RISK]:         'Risk',
  [RelationalInsightCategory.ANOMALY]:      'Anomaly',
};

/** Labels de severidade. */
export const INSIGHT_SEVERITY_LABELS: Record<RelationalInsightSeverity, string> = {
  [RelationalInsightSeverity.INFO]:       'Info',
  [RelationalInsightSeverity.SUGGESTION]: 'Suggestion',
  [RelationalInsightSeverity.IMPORTANT]:  'Important',
  [RelationalInsightSeverity.CRITICAL]:   'Critical',
};
