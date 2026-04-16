/**
 * Partners Module — Re-exports
 *
 * Parte 103: Escala + API + Parcerias
 */

export {
  createPartner,
  listPartners,
  getPartnerByReferralCode,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  trackReferralClick,
  convertReferral,
  registerWebhook,
  dispatchWebhook,
  listWebhooks,
} from './partner-service.js';

export type { CreatePartnerInput } from './partner-service.js';
