/**
 * Alert Engine — Observability & Alerting Engine
 *
 * Avalia regras de alerta contra métricas coletadas.
 * Dispara AlertEvents quando thresholds são ultrapassados.
 * Persiste alertas para consumo pelo admin backend.
 *
 * Mecanismo de alerta:
 *   1. Coleta métricas (via metrics-collector)
 *   2. Avalia cada regra ativa contra métricas
 *   3. Dispara AlertEvent se condição atendida + cooldown respeitado
 *   4. Persiste em bookagent_alerts
 *   5. Expõe via endpoint admin
 *   6. Preparado para integração futura com email/Slack/WhatsApp
 *
 * Parte 79: Observability & Alerting Engine
 */

import { v4 as uuid } from 'uuid';

import type {
  SystemMetric,
  AlertRule,
  AlertEvent,
} from '../../domain/entities/observability.js';
import {
  AlertSeverity,
  AlertStatus,
  DEFAULT_ALERT_RULES,
} from '../../domain/entities/observability.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

const ALERTS_TABLE = 'bookagent_alerts';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Regras ativas (inicializadas com defaults) */
let rules: AlertRule[] = DEFAULT_ALERT_RULES.map((r, i) => ({
  ...r,
  id: `default_${i}`,
}));

/** Alertas ativos em memória (cache) */
let activeAlerts: AlertEvent[] = [];

// ---------------------------------------------------------------------------
// Evaluate Rules
// ---------------------------------------------------------------------------

/**
 * Avalia todas as regras contra as métricas fornecidas.
 * Retorna novos alertas disparados.
 */
export function evaluateAlerts(metrics: SystemMetric[]): AlertEvent[] {
  const now = new Date();
  const newAlerts: AlertEvent[] = [];

  // Build metric lookup
  const metricMap = new Map<string, number>();
  for (const m of metrics) {
    metricMap.set(m.name, m.value);
  }

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const value = metricMap.get(rule.metricName);
    if (value === undefined) continue;

    const triggered = evaluateCondition(value, rule.operator, rule.threshold);
    if (!triggered) continue;

    // Check cooldown
    if (rule.lastFiredAt) {
      const cooldownMs = rule.cooldownMinutes * 60 * 1000;
      if (now.getTime() - rule.lastFiredAt.getTime() < cooldownMs) {
        continue; // Still in cooldown
      }
    }

    // Fire alert
    const alert: AlertEvent = {
      id: uuid(),
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      status: AlertStatus.ACTIVE,
      message: `${rule.description}: valor atual ${value} (threshold: ${rule.threshold})`,
      currentValue: value,
      threshold: rule.threshold,
      firedAt: now,
    };

    rule.lastFiredAt = now;
    newAlerts.push(alert);

    const logFn = rule.severity === AlertSeverity.CRITICAL ? logger.error : logger.warn;
    logFn(
      `[AlertEngine] ${rule.severity.toUpperCase()}: ${rule.name} — ` +
      `${value} ${rule.operator} ${rule.threshold}`,
    );
  }

  // Update active alerts
  activeAlerts = [
    ...activeAlerts.filter((a) => a.status === AlertStatus.ACTIVE),
    ...newAlerts,
  ];

  return newAlerts;
}

/**
 * Executa um ciclo completo: coleta métricas → avalia → persiste.
 */
export async function runAlertCycle(
  supabase: SupabaseClient | null,
): Promise<AlertEvent[]> {
  const { collectAllMetrics } = await import('./metrics-collector.js');
  const metrics = await collectAllMetrics(supabase);
  const newAlerts = evaluateAlerts(metrics);

  // Persist new alerts
  if (supabase && newAlerts.length > 0) {
    await persistAlerts(newAlerts, supabase);
  }

  // Auto-resolve stale alerts (>1h without re-fire)
  const oneHourAgo = new Date(Date.now() - 3600000);
  for (const alert of activeAlerts) {
    if (alert.status === AlertStatus.ACTIVE && alert.firedAt < oneHourAgo) {
      alert.status = AlertStatus.RESOLVED;
      alert.resolvedAt = new Date();
    }
  }

  return newAlerts;
}

// ---------------------------------------------------------------------------
// Get / Manage Alerts
// ---------------------------------------------------------------------------

/**
 * Retorna alertas ativos.
 */
export function getActiveAlerts(): AlertEvent[] {
  return activeAlerts.filter((a) => a.status === AlertStatus.ACTIVE);
}

/**
 * Retorna todos os alertas (incluindo resolvidos).
 */
export function getAllAlerts(): AlertEvent[] {
  return [...activeAlerts];
}

/**
 * Acknowledges um alerta.
 */
export function acknowledgeAlert(alertId: string): boolean {
  const alert = activeAlerts.find((a) => a.id === alertId);
  if (!alert) return false;
  alert.status = AlertStatus.ACKNOWLEDGED;
  return true;
}

/**
 * Resolve um alerta.
 */
export function resolveAlert(alertId: string): boolean {
  const alert = activeAlerts.find((a) => a.id === alertId);
  if (!alert) return false;
  alert.status = AlertStatus.RESOLVED;
  alert.resolvedAt = new Date();
  return true;
}

/**
 * Carrega alertas persistidos do Supabase.
 */
export async function loadPersistedAlerts(
  supabase: SupabaseClient | null,
  limit: number = 50,
): Promise<AlertEvent[]> {
  if (!supabase) return [];

  try {
    const rows = await supabase.select<{
      id: string;
      rule_id: string;
      rule_name: string;
      severity: string;
      status: string;
      message: string;
      current_value: number;
      threshold: number;
      tenant_id: string | null;
      metadata: string | null;
      fired_at: string;
      resolved_at: string | null;
    }>(ALERTS_TABLE, {
      orderBy: 'fired_at',
      orderDesc: true,
      limit,
    });

    return rows.map((r) => ({
      id: r.id,
      ruleId: r.rule_id,
      ruleName: r.rule_name,
      severity: r.severity as AlertSeverity,
      status: r.status as AlertStatus,
      message: r.message,
      currentValue: r.current_value,
      threshold: r.threshold,
      tenantId: r.tenant_id ?? undefined,
      metadata: r.metadata ? JSON.parse(r.metadata) as Record<string, unknown> : undefined,
      firedAt: new Date(r.fired_at),
      resolvedAt: r.resolved_at ? new Date(r.resolved_at) : undefined,
    }));
  } catch (err) {
    logger.warn(`[AlertEngine] Failed to load alerts: ${err}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Rules Management
// ---------------------------------------------------------------------------

/**
 * Retorna regras ativas.
 */
export function getAlertRules(): AlertRule[] {
  return [...rules];
}

/**
 * Adiciona uma regra customizada.
 */
export function addAlertRule(rule: AlertRule): void {
  rules.push(rule);
}

/**
 * Habilita/desabilita uma regra.
 */
export function toggleAlertRule(ruleId: string, enabled: boolean): boolean {
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) return false;
  rule.enabled = enabled;
  return true;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function persistAlerts(
  alerts: AlertEvent[],
  supabase: SupabaseClient,
): Promise<void> {
  try {
    const rows = alerts.map((a) => ({
      id: a.id,
      rule_id: a.ruleId,
      rule_name: a.ruleName,
      severity: a.severity,
      status: a.status,
      message: a.message,
      current_value: a.currentValue,
      threshold: a.threshold,
      tenant_id: a.tenantId ?? null,
      metadata: a.metadata ? JSON.stringify(a.metadata) : null,
      fired_at: a.firedAt.toISOString(),
      resolved_at: a.resolvedAt?.toISOString() ?? null,
    }));

    await supabase.insert(ALERTS_TABLE, rows);
  } catch (err) {
    logger.warn(`[AlertEngine] Failed to persist ${alerts.length} alerts: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function evaluateCondition(
  value: number,
  operator: AlertRule['operator'],
  threshold: number,
): boolean {
  switch (operator) {
    case 'gt': return value > threshold;
    case 'gte': return value >= threshold;
    case 'lt': return value < threshold;
    case 'lte': return value <= threshold;
    case 'eq': return value === threshold;
    default: return false;
  }
}
