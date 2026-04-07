/**
 * Admin Module — Admin / Ops Console
 *
 * Expõe API pública do módulo administrativo.
 *
 * Parte 77: Admin / Ops Console Backend
 */

// Queries
export {
  listTenants,
  listJobs,
  listFailedJobs,
  listPublications,
  listFailedPublications,
  listBillingOverview,
  getSystemHealth,
} from './admin-queries.js';

// Actions
export {
  executeAdminAction,
} from './admin-actions.js';

export type { AdminActionInput } from './admin-actions.js';
