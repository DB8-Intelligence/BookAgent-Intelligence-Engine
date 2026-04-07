/**
 * Integration Registry — External Integrations Expansion
 *
 * Registry centralizado de todas as integrações externas.
 * Resolve status, health e configuração de cada integração
 * a partir do catálogo estático + env vars.
 *
 * Não substitui os adapters/providers existentes — complementa
 * com visibilidade unificada.
 *
 * Parte 81: External Integrations Expansion
 */

import { v4 as uuid } from 'uuid';

import type {
  ExternalIntegration,
  IntegrationHealth,
  IntegrationEvent,
  IntegrationDefinition,
} from '../../domain/entities/integration.js';
import {
  IntegrationStatus,
  IntegrationEventType,
  INTEGRATION_CATALOG,
} from '../../domain/entities/integration.js';
import type { IExternalIntegration, ConfigValidationResult } from './integration-contract.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const EVENTS_TABLE = 'bookagent_integration_events';

// ---------------------------------------------------------------------------
// Registry State
// ---------------------------------------------------------------------------

/** Adapters registrados (implementam IExternalIntegration) */
const adapters = new Map<string, IExternalIntegration>();

/** Cache de health por integração */
const healthCache = new Map<string, IntegrationHealth>();

/** Eventos recentes em memória (ring buffer de 100) */
const recentEvents: IntegrationEvent[] = [];
const MAX_RECENT_EVENTS = 100;

// ---------------------------------------------------------------------------
// Register Adapter
// ---------------------------------------------------------------------------

/**
 * Registra um adapter que implementa IExternalIntegration.
 * Opcional — integrações sem adapter usam validação por env vars.
 */
export function registerIntegrationAdapter(adapter: IExternalIntegration): void {
  adapters.set(adapter.id, adapter);
  logger.info(`[IntegrationRegistry] Registered adapter: ${adapter.name}`);
}

// ---------------------------------------------------------------------------
// Resolve All Integrations
// ---------------------------------------------------------------------------

/**
 * Resolve o status de todas as integrações do catálogo.
 * Combina catálogo estático + env vars + adapters registrados.
 */
export function resolveAllIntegrations(): ExternalIntegration[] {
  return INTEGRATION_CATALOG.map((def) => resolveIntegration(def));
}

/**
 * Resolve uma integração específica por ID.
 */
export function resolveIntegrationById(id: string): ExternalIntegration | null {
  const def = INTEGRATION_CATALOG.find((d) => d.id === id);
  if (!def) return null;
  return resolveIntegration(def);
}

/**
 * Resolve integrações por categoria.
 */
export function resolveIntegrationsByType(type: string): ExternalIntegration[] {
  return INTEGRATION_CATALOG
    .filter((d) => d.type === type)
    .map((def) => resolveIntegration(def));
}

function resolveIntegration(def: IntegrationDefinition): ExternalIntegration {
  const validation = validateConfig(def);
  const cached = healthCache.get(def.id);

  let status: IntegrationStatus;
  if (!validation.valid) {
    status = IntegrationStatus.NOT_CONFIGURED;
  } else if (cached?.consecutiveFailures && cached.consecutiveFailures > 0) {
    status = IntegrationStatus.DEGRADED;
  } else {
    status = IntegrationStatus.ACTIVE;
  }

  const health: IntegrationHealth = cached ?? {
    status,
    latencyMs: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    consecutiveFailures: 0,
    uptimePct: validation.valid ? 100 : 0,
    checkedAt: new Date(),
  };

  // Sync status into health
  health.status = status;

  return {
    id: def.id,
    name: def.name,
    description: def.description,
    type: def.type,
    config: {
      enabled: validation.valid,
      requiredEnvVars: def.requiredEnvVars,
      featureFlag: def.featureFlag,
    },
    health,
    minPlanTier: def.minPlanTier,
  };
}

// ---------------------------------------------------------------------------
// Validate Config
// ---------------------------------------------------------------------------

/**
 * Valida se as env vars necessárias estão presentes.
 */
export function validateConfig(def: IntegrationDefinition): ConfigValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const envVar of def.requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (def.requiredEnvVars.length === 0) {
    // No env vars required (e.g., manual billing) — always valid
    return { valid: true, missingVars: [], warnings };
  }

  return {
    valid: missing.length === 0,
    missingVars: missing,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

/**
 * Executa health check de uma integração.
 * Usa adapter registrado se disponível, senão faz check por env vars.
 */
export async function checkIntegrationHealth(
  integrationId: string,
): Promise<IntegrationHealth> {
  const adapter = adapters.get(integrationId);

  if (adapter) {
    try {
      const health = await adapter.checkHealth();
      healthCache.set(integrationId, health);
      recordEvent(integrationId, IntegrationEventType.HEALTH_CHECK, true,
        `Health OK: ${health.latencyMs ?? 0}ms`);
      return health;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const cached = healthCache.get(integrationId);
      const health: IntegrationHealth = {
        status: IntegrationStatus.DEGRADED,
        latencyMs: null,
        lastSuccessAt: cached?.lastSuccessAt ?? null,
        lastFailureAt: new Date(),
        lastError: error,
        consecutiveFailures: (cached?.consecutiveFailures ?? 0) + 1,
        uptimePct: cached?.uptimePct ?? 0,
        checkedAt: new Date(),
      };
      healthCache.set(integrationId, health);
      recordEvent(integrationId, IntegrationEventType.HEALTH_CHECK, false, error);
      return health;
    }
  }

  // Fallback: check by env var presence
  const def = INTEGRATION_CATALOG.find((d) => d.id === integrationId);
  if (!def) {
    return {
      status: IntegrationStatus.NOT_CONFIGURED,
      latencyMs: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: 'Integration not found in catalog',
      consecutiveFailures: 0,
      uptimePct: 0,
      checkedAt: new Date(),
    };
  }

  const validation = validateConfig(def);
  const health: IntegrationHealth = {
    status: validation.valid ? IntegrationStatus.ACTIVE : IntegrationStatus.NOT_CONFIGURED,
    latencyMs: null,
    lastSuccessAt: validation.valid ? new Date() : null,
    lastFailureAt: null,
    lastError: validation.valid ? null : `Missing: ${validation.missingVars.join(', ')}`,
    consecutiveFailures: 0,
    uptimePct: validation.valid ? 100 : 0,
    checkedAt: new Date(),
  };

  healthCache.set(integrationId, health);
  return health;
}

/**
 * Executa health check de todas as integrações configuradas.
 */
export async function checkAllIntegrationsHealth(): Promise<Map<string, IntegrationHealth>> {
  const results = new Map<string, IntegrationHealth>();

  for (const def of INTEGRATION_CATALOG) {
    const health = await checkIntegrationHealth(def.id);
    results.set(def.id, health);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Record Integration Event
// ---------------------------------------------------------------------------

/**
 * Registra um evento de integração (em memória + opcional Supabase).
 */
export function recordEvent(
  integrationId: string,
  eventType: IntegrationEventType,
  success: boolean,
  message: string,
  latencyMs?: number,
  tenantId?: string,
): IntegrationEvent {
  const event: IntegrationEvent = {
    id: uuid(),
    integrationId,
    eventType,
    success,
    message,
    latencyMs,
    tenantId,
    createdAt: new Date(),
  };

  // Ring buffer
  recentEvents.push(event);
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.shift();
  }

  // Update health cache on connection events
  if (eventType === IntegrationEventType.CONNECTION_LOST) {
    const cached = healthCache.get(integrationId);
    if (cached) {
      cached.status = IntegrationStatus.DEGRADED;
      cached.lastFailureAt = new Date();
      cached.lastError = message;
      cached.consecutiveFailures++;
    }
  } else if (eventType === IntegrationEventType.CONNECTION_RESTORED) {
    const cached = healthCache.get(integrationId);
    if (cached) {
      cached.status = IntegrationStatus.ACTIVE;
      cached.lastSuccessAt = new Date();
      cached.consecutiveFailures = 0;
    }
  }

  return event;
}

/**
 * Retorna eventos recentes (do buffer em memória).
 */
export function getRecentEvents(integrationId?: string, limit: number = 50): IntegrationEvent[] {
  let events = [...recentEvents].reverse();
  if (integrationId) {
    events = events.filter((e) => e.integrationId === integrationId);
  }
  return events.slice(0, limit);
}

/**
 * Persiste eventos no Supabase.
 */
export async function persistEvents(
  events: IntegrationEvent[],
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase || events.length === 0) return;

  try {
    const rows = events.map((e) => ({
      id: e.id,
      integration_id: e.integrationId,
      event_type: e.eventType,
      success: e.success,
      message: e.message,
      latency_ms: e.latencyMs ?? null,
      tenant_id: e.tenantId ?? null,
      created_at: e.createdAt.toISOString(),
    }));

    await supabase.insert(EVENTS_TABLE, rows);
  } catch (err) {
    logger.warn(`[IntegrationRegistry] Failed to persist events: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Summary for admin/health
// ---------------------------------------------------------------------------

/**
 * Gera resumo de saúde de todas as integrações.
 */
export function getIntegrationsSummary(): {
  total: number;
  active: number;
  configured: number;
  degraded: number;
  notConfigured: number;
  integrations: ExternalIntegration[];
} {
  const integrations = resolveAllIntegrations();

  return {
    total: integrations.length,
    active: integrations.filter((i) => i.health.status === IntegrationStatus.ACTIVE).length,
    configured: integrations.filter((i) =>
      i.health.status === IntegrationStatus.ACTIVE || i.health.status === IntegrationStatus.CONFIGURED,
    ).length,
    degraded: integrations.filter((i) => i.health.status === IntegrationStatus.DEGRADED).length,
    notConfigured: integrations.filter((i) => i.health.status === IntegrationStatus.NOT_CONFIGURED).length,
    integrations,
  };
}
