/**
 * Knowledge Graph Module — Knowledge Graph & Relational Intelligence
 *
 * Parte 92: Knowledge Graph & Relational Intelligence
 */

export {
  buildTenantGraph,
  saveNode,
  saveEdge,
  type BuildResult,
} from './graph-builder.js';

export {
  loadNodes,
  loadEdges,
  getNodeRelations,
  queryByType,
  getStrongRelations,
  findConnectedNodes,
  findNodeByEntity,
  buildSnapshot,
} from './graph-query.js';

export {
  generateIntelligence,
  type IntelligenceResult,
  type HubNodeInfo,
} from './graph-intelligence.js';
