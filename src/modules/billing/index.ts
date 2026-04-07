/**
 * Billing Module — Billing & Usage Tracking + Gateway Integration
 *
 * Expõe a API pública do módulo de metering, limites e assinaturas.
 *
 * Parte 75: Billing & Usage Tracking
 * Parte 76: Billing Gateway Integration
 */

// Usage Meter (Parte 75)
export {
  recordUsage,
  recordUsageBatch,
  getUsageCount,
  getAllUsageCounts,
  recordBillingEvent,
  currentMonthKey,
  toMonthKey,
  toDayKey,
} from './usage-meter.js';

// Limit Checker (Parte 75)
export {
  checkUsageLimit,
  checkAndRecordUsage,
  getRemainingQuota,
  getUsageSummary,
} from './limit-checker.js';

// Subscription Manager (Parte 76)
export {
  createSubscription,
  changePlan,
  cancelSubscription,
  reactivateSubscription,
  getSubscription,
  processWebhookEvent,
} from './subscription-manager.js';

// Provider Factory (Parte 76)
export {
  getBillingProvider,
  getProviderByType,
  registerBillingProvider,
  getProviderStatus,
} from './provider-factory.js';

// Types
export type { RecordUsageInput } from './usage-meter.js';
export type { LimitCheckResponse } from './limit-checker.js';
export type {
  IBillingProvider,
  ProviderResult,
  CreateCustomerInput,
  CreateSubscriptionInput,
  ChangePlanInput,
  ParsedWebhookEvent,
} from './billing-provider.js';
