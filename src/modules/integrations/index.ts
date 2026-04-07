/**
 * Integrations Module — External Integrations Expansion
 *
 * Parte 81: External Integrations Expansion
 */

// Contract
export type { IExternalIntegration, ConfigValidationResult } from './integration-contract.js';

// Registry
export {
  registerIntegrationAdapter,
  resolveAllIntegrations,
  resolveIntegrationById,
  resolveIntegrationsByType,
  validateConfig,
  checkIntegrationHealth,
  checkAllIntegrationsHealth,
  recordEvent,
  getRecentEvents,
  persistEvents,
  getIntegrationsSummary,
} from './integration-registry.js';
