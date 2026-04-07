/**
 * Memory Consolidator — Memory & Longitudinal Tenant Intelligence
 *
 * Transforma signals pontuais em patterns persistentes.
 *
 * Ciclo:
 *   1. Coletar signals de diversas fontes (learning, analytics, etc.)
 *   2. Agrupar por patternKey
 *   3. Consolidar: signals convergentes → pattern
 *   4. Atualizar strength/confidence
 *   5. Aplicar decay em patterns antigos
 *   6. Persistir TenantMemory
 *
 * Diferença vs Learning Engine:
 *   - Learning detecta regras de curto/médio prazo
 *   - Memory consolida padrões duradouros (longitudinal)
 *   - Learning pode alimentar Memory com signals
 *
 * Parte 90: Memory & Longitudinal Tenant Intelligence
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  TenantMemory,
  MemorySignal,
  MemoryPattern,
} from '../../domain/entities/tenant-memory.js';
import {
  MemoryCategory,
  MemoryStrength,
  PatternStatus,
  MemorySignalSource,
  DECAY_START_DAYS,
  DECAY_FACTOR_PER_PERIOD,
  MIN_CONFIDENCE_THRESHOLD,
  CONFIRM_THRESHOLD,
  STABLE_THRESHOLD,
} from '../../domain/entities/tenant-memory.js';
import type { TenantContext } from '../../domain/entities/tenant.js';
import { defaultTimeFilter, getJobAnalytics, getPublicationAnalytics } from '../analytics/analytics-service.js';
import { getUsageSummary } from '../billing/index.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const TABLE = 'bookagent_tenant_memory';

export async function saveTenantMemory(
  memory: TenantMemory,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  await supabase.upsert(TABLE, {
    tenant_id: memory.tenantId,
    patterns: memory.patterns,
    latest_profile: memory.latestProfile,
    total_signals_processed: memory.totalSignalsProcessed,
    last_consolidated_at: memory.lastConsolidatedAt,
    updated_at: memory.updatedAt,
  }, 'tenant_id');
}

export async function loadTenantMemory(
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<TenantMemory | null> {
  if (!supabase) return null;

  const rows = await supabase.select<Record<string, unknown>>(TABLE, {
    filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
    limit: 1,
  });

  if (rows.length === 0) return null;
  const row = rows[0]!;
  return {
    tenantId: row['tenant_id'] as string,
    patterns: (row['patterns'] ?? []) as MemoryPattern[],
    latestProfile: (row['latest_profile'] as TenantMemory['latestProfile']) ?? null,
    totalSignalsProcessed: (row['total_signals_processed'] as number) ?? 0,
    lastConsolidatedAt: row['last_consolidated_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}

// ---------------------------------------------------------------------------
// Signal Collection
// ---------------------------------------------------------------------------

/**
 * Collects memory signals from analytics, usage, publications.
 */
export async function collectSignals(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<MemorySignal[]> {
  const signals: MemorySignal[] = [];
  const tid = tenantCtx.tenantId;
  const now = new Date().toISOString();
  const filter = defaultTimeFilter(tid);

  const [jobs, pubs, usage] = await Promise.all([
    getJobAnalytics(filter, supabase),
    getPublicationAnalytics(filter, supabase),
    getUsageSummary(tenantCtx, supabase),
  ]);

  // Job volume signal
  signals.push({
    id: uuid(), tenantId: tid,
    source: MemorySignalSource.ANALYTICS,
    category: MemoryCategory.OPERATIONAL_MATURITY,
    patternKey: 'avg_jobs_per_period',
    value: String(jobs.totalJobs),
    weight: 1, observedAt: now,
  });

  // Success rate signal
  signals.push({
    id: uuid(), tenantId: tid,
    source: MemorySignalSource.ANALYTICS,
    category: MemoryCategory.OPERATIONAL_MATURITY,
    patternKey: 'job_success_rate',
    value: String(jobs.successRate),
    weight: 1, observedAt: now,
  });

  // Publication success signal
  signals.push({
    id: uuid(), tenantId: tid,
    source: MemorySignalSource.PUBLICATION,
    category: MemoryCategory.PUBLICATION,
    patternKey: 'publish_success_rate',
    value: String(pubs.successRate),
    weight: 1, observedAt: now,
  });

  // Publication volume
  signals.push({
    id: uuid(), tenantId: tid,
    source: MemorySignalSource.PUBLICATION,
    category: MemoryCategory.PUBLICATION,
    patternKey: 'avg_publications_per_period',
    value: String(pubs.totalAttempted),
    weight: 1, observedAt: now,
  });

  // Channel preference from publications
  if (pubs.byPlatform && pubs.byPlatform.length > 0) {
    const best = pubs.byPlatform.sort((a: { total: number }, b: { total: number }) => b.total - a.total)[0];
    if (best) {
      signals.push({
        id: uuid(), tenantId: tid,
        source: MemorySignalSource.PUBLICATION,
        category: MemoryCategory.CHANNEL,
        patternKey: 'preferred_channel',
        value: (best as { platform: string }).platform,
        weight: 1, observedAt: now,
      });
    }
  }

  // Plan usage signal
  signals.push({
    id: uuid(), tenantId: tid,
    source: MemorySignalSource.USAGE,
    category: MemoryCategory.PLAN_USAGE,
    patternKey: 'current_plan',
    value: tenantCtx.planTier,
    weight: 1, observedAt: now,
  });

  // Auto publish preference
  signals.push({
    id: uuid(), tenantId: tid,
    source: MemorySignalSource.USAGE,
    category: MemoryCategory.PUBLICATION,
    patternKey: 'uses_auto_publish',
    value: String(tenantCtx.features.autoPublish),
    weight: 1, observedAt: now,
  });

  return signals;
}

// ---------------------------------------------------------------------------
// Consolidation
// ---------------------------------------------------------------------------

/**
 * Consolidates signals into a TenantMemory — the main consolidation cycle.
 */
export async function consolidateMemory(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<TenantMemory> {
  const tid = tenantCtx.tenantId;
  const now = new Date().toISOString();

  // 1. Load existing memory
  const existing = await loadTenantMemory(tid, supabase);
  const existingPatterns = existing?.patterns ?? [];
  const totalPrev = existing?.totalSignalsProcessed ?? 0;

  // 2. Collect new signals
  const signals = await collectSignals(tenantCtx, supabase);

  // 3. Process signals into patterns
  const updatedPatterns = processSignals(existingPatterns, signals, tid, now);

  // 4. Apply decay to old patterns
  applyDecay(updatedPatterns, now);

  // 5. Remove obsolete patterns
  const activePatterns = updatedPatterns.filter(
    (p) => p.status !== PatternStatus.OBSOLETE,
  );

  // 6. Build memory
  const memory: TenantMemory = {
    tenantId: tid,
    patterns: activePatterns,
    latestProfile: existing?.latestProfile ?? null,
    totalSignalsProcessed: totalPrev + signals.length,
    lastConsolidatedAt: now,
    updatedAt: now,
  };

  // 7. Persist
  await saveTenantMemory(memory, supabase);

  logger.info(
    `[MemoryConsolidator] Consolidated memory for tenant=${tid}: ` +
    `${signals.length} signals, ${activePatterns.length} patterns, ` +
    `${updatedPatterns.length - activePatterns.length} obsolete removed`,
  );

  return memory;
}

// ---------------------------------------------------------------------------
// Signal Processing
// ---------------------------------------------------------------------------

function processSignals(
  existingPatterns: MemoryPattern[],
  signals: MemorySignal[],
  tenantId: string,
  now: string,
): MemoryPattern[] {
  const patternMap = new Map<string, MemoryPattern>();

  // Index existing
  for (const p of existingPatterns) {
    patternMap.set(p.key, p);
  }

  // Process each signal
  for (const signal of signals) {
    const existing = patternMap.get(signal.patternKey);

    if (existing) {
      // Update existing pattern
      if (existing.value === signal.value) {
        // Confirming signal
        existing.confirmationCount += 1;
        existing.lastConfirmedAt = now;
        existing.decayFactor = 1; // reset decay on confirmation
      } else {
        // Contradicting signal
        existing.contradictionCount += 1;

        // If contradictions exceed confirmations, update value
        if (existing.contradictionCount > existing.confirmationCount * 0.5) {
          existing.value = signal.value;
          existing.contradictionCount = 0;
          existing.confirmationCount = 1;
          existing.status = PatternStatus.EMERGING;
        }
      }

      // Update strength and status
      updateStrengthAndStatus(existing);
    } else {
      // New pattern
      const pattern: MemoryPattern = {
        id: uuid(),
        tenantId,
        category: signal.category,
        key: signal.patternKey,
        value: signal.value,
        description: buildPatternDescription(signal.patternKey, signal.value),
        strength: MemoryStrength.WEAK,
        confidence: 20,
        status: PatternStatus.EMERGING,
        confirmationCount: 1,
        contradictionCount: 0,
        firstSeenAt: now,
        lastConfirmedAt: now,
        decayFactor: 1,
      };
      patternMap.set(pattern.key, pattern);
    }
  }

  return Array.from(patternMap.values());
}

function updateStrengthAndStatus(pattern: MemoryPattern): void {
  const total = pattern.confirmationCount + pattern.contradictionCount;
  const confirmRatio = total > 0 ? pattern.confirmationCount / total : 0;

  // Confidence: based on confirmations and consistency
  pattern.confidence = Math.min(100, Math.round(
    (pattern.confirmationCount * 8) * confirmRatio * pattern.decayFactor,
  ));

  // Strength
  if (pattern.confidence >= 80) pattern.strength = MemoryStrength.VERY_STRONG;
  else if (pattern.confidence >= 60) pattern.strength = MemoryStrength.STRONG;
  else if (pattern.confidence >= 35) pattern.strength = MemoryStrength.MODERATE;
  else pattern.strength = MemoryStrength.WEAK;

  // Status
  if (pattern.confirmationCount >= STABLE_THRESHOLD && confirmRatio >= 0.7) {
    pattern.status = PatternStatus.STABLE;
  } else if (pattern.confirmationCount >= CONFIRM_THRESHOLD && confirmRatio >= 0.6) {
    pattern.status = PatternStatus.CONFIRMED;
  } else if (pattern.contradictionCount > pattern.confirmationCount) {
    pattern.status = PatternStatus.DECLINING;
  } else {
    pattern.status = PatternStatus.EMERGING;
  }
}

// ---------------------------------------------------------------------------
// Decay
// ---------------------------------------------------------------------------

function applyDecay(patterns: MemoryPattern[], now: string): void {
  const nowMs = new Date(now).getTime();

  for (const pattern of patterns) {
    const lastMs = new Date(pattern.lastConfirmedAt).getTime();
    const daysSinceConfirm = (nowMs - lastMs) / 86400000;

    if (daysSinceConfirm > DECAY_START_DAYS) {
      const periods = Math.floor((daysSinceConfirm - DECAY_START_DAYS) / 30);
      pattern.decayFactor = Math.pow(DECAY_FACTOR_PER_PERIOD, periods);
      pattern.confidence = Math.round(pattern.confidence * pattern.decayFactor);

      if (pattern.confidence < MIN_CONFIDENCE_THRESHOLD) {
        pattern.status = PatternStatus.OBSOLETE;
      } else if (pattern.status === PatternStatus.STABLE || pattern.status === PatternStatus.CONFIRMED) {
        pattern.status = PatternStatus.DECLINING;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPatternDescription(key: string, value: string): string {
  const descriptions: Record<string, string> = {
    preferred_format: `Formato preferido: ${value}`,
    preferred_channel: `Canal preferido: ${value}`,
    avg_jobs_per_period: `Volume médio de jobs: ${value}`,
    job_success_rate: `Taxa de sucesso de jobs: ${value}%`,
    publish_success_rate: `Taxa de sucesso de publicação: ${value}%`,
    avg_publications_per_period: `Volume médio de publicações: ${value}`,
    uses_auto_publish: `Usa auto publish: ${value}`,
    current_plan: `Plano atual: ${value}`,
    avg_approval_time: `Tempo médio de aprovação: ${value}h`,
    approval_rate: `Taxa de aprovação: ${value}%`,
  };

  return descriptions[key] ?? `${key}: ${value}`;
}
