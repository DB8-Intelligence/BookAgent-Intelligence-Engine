/**
 * Explainability Module — Trust, Explanation & Audit Surfaces
 *
 * Parte 97: Trust, Explanation & Audit Surfaces
 */

export {
  explainDecision,
  explainJob,
  explainPublication,
  loadExplanation,
  listExplanations,
  saveExplanation,
} from './explanation-builder.js';

export {
  evaluateTenantTrust,
  evaluateEntityTrust,
} from './trust-evaluator.js';

export {
  buildAuditSurface,
  buildCampaignAudit,
  buildPublicationAudit,
} from './audit-surface.js';
