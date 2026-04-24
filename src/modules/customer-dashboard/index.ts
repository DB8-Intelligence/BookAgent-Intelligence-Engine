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
  getGallery,
} from './dashboard-service.js';

export type {
  CustomerPublicationsOverview,
  CustomerCampaignView,
  CustomerCampaignsOverview,
  GalleryItem,
  GalleryFilters,
} from './dashboard-service.js';
