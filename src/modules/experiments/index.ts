/**
 * Experiments Module — A/B Testing Engine
 *
 * Expõe a API pública do módulo de experimentos A/B.
 *
 * Parte 72: A/B Testing Engine
 */

// Builder
export {
  buildExperiment,
  buildExperimentFromJob,
} from './experiment-builder.js';

// Tracker
export {
  trackEvent,
  selectWinner,
  selectWinnerManual,
  startExperiment,
  cancelExperiment,
  persistExperiment,
  loadExperiment,
  listExperiments,
} from './experiment-tracker.js';
