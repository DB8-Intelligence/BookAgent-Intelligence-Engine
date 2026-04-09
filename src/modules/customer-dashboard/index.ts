/**
 * Customer Dashboard Module
 *
 * Expõe API pública do módulo de dashboard do cliente.
 *
 * Parte 78: Customer Dashboard Backend
 */

export {
  getOverview,
  getJobList,
  getJobDetail,
  getUsageView,
  getBillingView,
  getInsightsView,
  getPublicationsOverview,
  getCampaignsOverview,
} from './dashboard-service.js';

export type {
  CustomerPublicationsOverview,
  CustomerCampaignView,
  CustomerCampaignsOverview,
} from './dashboard-service.js';
