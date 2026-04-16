/**
 * Integration Hub Module — Re-exports
 * Parte 103: Escala
 */

export {
  createConnection,
  listConnections,
  getConnection,
  updateConnectionStatus,
  deleteConnection,
  dispatchSyncEvent,
  pingConnection,
  getCatalog,
  getSyncLogs,
} from './integration-hub.js';

export type { CreateConnectionInput } from './integration-hub.js';
