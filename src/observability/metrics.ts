/**
 * Metrics Tracker — BookAgent Intelligence Engine
 *
 * Rastreia métricas de uso por usuário e por plano.
 * Persiste em bookagent_usage_metrics no Supabase (migration 004).
 *
 * Eventos rastreados:
 *   - job_started:    usuário iniciou um job
 *   - job_completed:  job concluído com sucesso (com duration_ms)
 *   - job_failed:     job falhou (com error_code)
 *   - publish_attempt: tentativa de publicação social (com platform + success)
 *   - approval_action: ação de aprovação (com decision)
 *
 * Uso:
 *   import { metrics } from './metrics.js';
 *   await metrics.track('job_started', { userId, planTier, jobId });
 *
 * Parte 55: Escala Real e Monetização
 */

import { logger } from '../utils/logger.js';
import type { SupabaseClient } from '../persistence/supabase-client.js';
import type { PlanTier } from '../plans/plan-config.js';

// ============================================================================
// Types
// ============================================================================

export type MetricEvent =
  | 'job_started'
  | 'job_completed'
  | 'job_failed'
  | 'publish_attempt'
  | 'approval_action';

export interface MetricPayload {
  userId: string;
  planTier: PlanTier;
  jobId?: string;
  /** job_completed: tempo de processamento em ms */
  durationMs?: number;
  /** job_failed: código de erro */
  errorCode?: string;
  /** publish_attempt: plataforma (instagram, facebook) */
  platform?: string;
  /** publish_attempt: sucesso ou falha */
  success?: boolean;
  /** approval_action: decisão (approved, rejected, comment) */
  decision?: string;
  /** Metadados adicionais livres */
  metadata?: Record<string, unknown>;
}

interface UsageMetricRow {
  event: MetricEvent;
  user_id: string;
  plan_tier: PlanTier;
  job_id: string | null;
  duration_ms: number | null;
  error_code: string | null;
  platform: string | null;
  success: boolean | null;
  decision: string | null;
  metadata: Record<string, unknown> | null;
}

// ============================================================================
// In-memory aggregator (flush to DB periodically)
// ============================================================================

class MetricsTracker {
  private client: SupabaseClient | null = null;
  private buffer: UsageMetricRow[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  setSupabaseClient(c: SupabaseClient): void {
    this.client = c;
    // Flush para o Supabase a cada 30s
    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => {
        this.flush().catch((err) => {
          logger.warn(`[Metrics] Flush error: ${err instanceof Error ? err.message : String(err)}`);
        });
      }, 30_000);
      this.flushTimer.unref();
    }
  }

  /** Registra um evento de métrica. Fire-and-forget (não lança exceção). */
  track(event: MetricEvent, payload: MetricPayload): void {
    const row: UsageMetricRow = {
      event,
      user_id: payload.userId,
      plan_tier: payload.planTier,
      job_id: payload.jobId ?? null,
      duration_ms: payload.durationMs ?? null,
      error_code: payload.errorCode ?? null,
      platform: payload.platform ?? null,
      success: payload.success ?? null,
      decision: payload.decision ?? null,
      metadata: payload.metadata ?? null,
    };

    this.buffer.push(row);

    // Flush imediato se buffer grande
    if (this.buffer.length >= 50) {
      this.flush().catch(() => undefined);
    }
  }

  /** Persiste o buffer no Supabase e limpa. */
  async flush(): Promise<void> {
    if (!this.client || this.buffer.length === 0) return;

    const rows = this.buffer.splice(0);
    try {
      await this.client.insert('bookagent_usage_metrics', rows);
      logger.debug(`[Metrics] Flushed ${rows.length} events to Supabase`);
    } catch (err) {
      // Recolocar no buffer para próxima tentativa
      this.buffer.unshift(...rows);
      logger.warn(`[Metrics] Failed to flush ${rows.length} events: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // --------------------------------------------------------------------------
  // Convenience methods
  // --------------------------------------------------------------------------

  trackJobStarted(userId: string, planTier: PlanTier, jobId: string): void {
    this.track('job_started', { userId, planTier, jobId });
  }

  trackJobCompleted(userId: string, planTier: PlanTier, jobId: string, durationMs: number): void {
    this.track('job_completed', { userId, planTier, jobId, durationMs });
  }

  trackJobFailed(userId: string, planTier: PlanTier, jobId: string, errorCode: string): void {
    this.track('job_failed', { userId, planTier, jobId, errorCode });
  }

  trackPublishAttempt(
    userId: string,
    planTier: PlanTier,
    jobId: string,
    platform: string,
    success: boolean,
  ): void {
    this.track('publish_attempt', { userId, planTier, jobId, platform, success });
  }

  trackApprovalAction(
    userId: string,
    planTier: PlanTier,
    jobId: string,
    decision: string,
  ): void {
    this.track('approval_action', { userId, planTier, jobId, decision });
  }
}

// Singleton
export const metrics = new MetricsTracker();
