/**
 * Learning Module — Learning Engine
 *
 * Expõe a API pública do módulo de aprendizado contínuo.
 *
 * Parte 73: Learning Engine
 */

// Signal Collector
export {
  collectFromScoring,
  collectFromExperiment,
  collectFromReviews,
  collectFromUsage,
} from './signal-collector.js';

// Aggregator
export {
  aggregateSignals,
  findTopPerformers,
  findWorstPerformers,
} from './aggregator.js';

// Rule Engine
export {
  generateRules,
  evaluateRules,
  recordRuleOutcome,
  buildLearningProfile,
  persistSignals,
  persistRules,
  loadSignals,
  loadRules,
} from './rule-engine.js';
