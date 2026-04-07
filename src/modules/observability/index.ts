/**
 * Observability Module — Observability & Alerting Engine
 *
 * Expõe API pública do módulo de observabilidade.
 *
 * Parte 79: Observability & Alerting Engine
 */

// Metrics Collector
export {
  collectSnapshot,
  collectAllMetrics,
  collectTenantHealth,
} from './metrics-collector.js';

// Alert Engine
export {
  evaluateAlerts,
  runAlertCycle,
  getActiveAlerts,
  getAllAlerts,
  acknowledgeAlert,
  resolveAlert,
  loadPersistedAlerts,
  getAlertRules,
  addAlertRule,
  toggleAlertRule,
} from './alert-engine.js';
