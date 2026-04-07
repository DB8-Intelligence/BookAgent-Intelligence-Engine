/**
 * Simulation Module — Simulation & What-If Engine
 *
 * Parte 93: Simulation & What-If Engine
 */

export {
  buildBaseline,
  buildAlternative,
  parseChanges,
  type RawChange,
} from './scenario-builder.js';

export {
  runSimulation,
  loadSimulation,
  listSimulations,
} from './impact-estimator.js';
