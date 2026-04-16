/**
 * Acquisition Module — Re-exports
 * Parte 103: Escala
 */

export {
  createCampaign,
  listCampaigns,
  updateCampaignMetrics,
  scheduleContent,
  listScheduledContent,
  getDueSchedules,
  markSchedulePublished,
  createNurturingSequence,
  listNurturingSequences,
  trackConversion,
  listConversions,
  getGrowthMetrics,
} from './acquisition-engine.js';

export type { CreateCampaignInput, GrowthDashboard } from './acquisition-engine.js';
