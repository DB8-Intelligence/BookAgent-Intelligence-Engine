/**
 * Campaigns Module — Content Campaign Orchestration
 *
 * Parte 85: Content Campaign Orchestration
 */

export {
  buildBlueprint,
  buildCampaign,
  buildCampaignFromStrategy,
} from './campaign-builder.js';

export {
  saveCampaign,
  listCampaigns,
  getCampaign,
  transitionStatus,
  linkOutput,
  updateItemStatus,
  recalculateProgress,
} from './campaign-manager.js';
