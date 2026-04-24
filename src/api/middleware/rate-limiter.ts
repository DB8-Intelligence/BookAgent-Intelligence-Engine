/**
 * Rate Limiter — BookAgent Intelligence Engine
 *
 * Rate limiting por user_id baseado em contadores in-memory com janela deslizante.
 * Sem dependência de Redis — funciona em modo síncrono e em modo fila.
 *
 * Dois limitadores independentes:
 *   - requestsPerMinute: limite de requests HTTP por minuto
 *   - jobsPerHour:       limite de jobs iniciados por hora
 *
 * Os limites são lidos de PLANS[tier] — configuráveis por plano.
 * Se o user_id não for resolvido, usa o IP como fallback.
 *
 * Parte 55: Escala Real e Monetização
 *
 * Nota de escala: este limitador é por instância (in-memory). Com múltiplas
 * instâncias Cloud Run, substituir por Memorystore/Firestore distribuído.
 */

import type { Request, Response, NextFunction } from 'express';
import { getPlan, type PlanTier } from '../../plans/plan-config.js';
import { sendError } from '../helpers/response.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Sliding window counter
// ============================================================================

interface WindowEntry {
  count: number;
  windowStart: number; // ms timestamp
}

class SlidingWindowCounter {
  private windows: Map<string, WindowEntry> = new Map();
  private readonly windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  increment(key: string): number {
    const now = Date.now();
    const entry = this.windows.get(key);

    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.windows.set(key, { count: 1, windowStart: now });
      return 1;
    }

    entry.count++;
    return entry.count;
  }

  get(key: string): number {
    const now = Date.now();
    const entry = this.windows.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) return 0;
    return entry.count;
  }

  /** Limpa entradas expiradas. Chamar periodicamente para evitar memory leak. */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.windows) {
      if (now - entry.windowStart >= this.windowMs) {
        this.windows.delete(key);
      }
    }
  }
}

// ============================================================================
// Shared counters (module-level singletons)
// ============================================================================

const minuteCounter = new SlidingWindowCounter(60_000);   // 1 minuto
const hourCounter   = new SlidingWindowCounter(3_600_000); // 1 hora

// Limpar contadores a cada 5 minutos para evitar crescimento ilimitado
setInterval(() => {
  minuteCounter.cleanup();
  hourCounter.cleanup();
}, 5 * 60_000).unref(); // .unref() para não bloquear o processo

// ============================================================================
// Middleware factories
// ============================================================================

/**
 * Limita requests por minuto com base no plano do usuário.
 * Usa req.resolvedUserId (injetado por planGuard) ou IP como fallback.
 */
export function requestRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const id = req.resolvedUserId ?? req.ip ?? 'unknown';
  const tier: PlanTier = req.resolvedPlanTier ?? 'starter';
  const limit = getPlan(tier).limits.requestsPerMinute;

  const count = minuteCounter.increment(id);

  if (count > limit) {
    logger.warn(`[RateLimiter] requests/min exceeded for id=${id} plan=${tier} count=${count}/${limit}`);
    res.setHeader('Retry-After', '60');
    sendError(
      res,
      'RATE_LIMIT_EXCEEDED',
      `Limite de ${limit} requests/minuto atingido para o plano ${tier}. Tente novamente em 1 minuto.`,
      429,
    );
    return;
  }

  next();
}

/**
 * Limita jobs iniciados por hora com base no plano do usuário.
 * Deve ser chamado no endpoint POST /process, após planGuard.
 */
export function jobRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const id = req.resolvedUserId ?? req.ip ?? 'unknown';
  const tier: PlanTier = req.resolvedPlanTier ?? 'starter';
  const limit = getPlan(tier).limits.jobsPerHour;

  const key = `job:${id}`;
  const count = hourCounter.increment(key);

  if (count > limit) {
    logger.warn(`[RateLimiter] jobs/hour exceeded for id=${id} plan=${tier} count=${count}/${limit}`);
    res.setHeader('Retry-After', '3600');
    sendError(
      res,
      'JOB_RATE_LIMIT',
      `Limite de ${limit} jobs/hora atingido para o plano ${tier}. Tente novamente mais tarde.`,
      429,
    );
    return;
  }

  next();
}
