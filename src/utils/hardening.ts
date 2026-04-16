/**
 * Hardening Utilities — Production Safety
 *
 * Provides retry, timeout and safe-execute utilities for
 * production robustness.
 *
 * Parte 100: Consolidação Final + Product Hardening
 */

import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Retry with exponential backoff
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Max attempts (default 3) */
  maxAttempts?: number;
  /** Base delay in ms (default 1000) */
  baseDelayMs?: number;
  /** Backoff multiplier (default 2) */
  multiplier?: number;
  /** Operation label for logging */
  label?: string;
}

/**
 * Retry an async operation with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelay = opts.baseDelayMs ?? 1000;
  const multiplier = opts.multiplier ?? 2;
  const label = opts.label ?? 'operation';

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(multiplier, attempt - 1);
        logger.warn(
          `[Retry] ${label} attempt ${attempt}/${maxAttempts} failed: ${lastError.message}. ` +
          `Retrying in ${delay}ms...`,
        );
        await sleep(delay);
      }
    }
  }

  logger.error(`[Retry] ${label} failed after ${maxAttempts} attempts: ${lastError?.message}`);
  throw lastError;
}

// ---------------------------------------------------------------------------
// Timeout wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps a promise with a timeout. Rejects with TimeoutError if exceeded.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label = 'operation',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`[Timeout] ${label} exceeded ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer!);
    return result;
  } catch (err) {
    clearTimeout(timer!);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Safe execute (catch + log, no throw)
// ---------------------------------------------------------------------------

/**
 * Executes an async function safely — catches errors and returns fallback.
 * Useful for non-critical operations that shouldn't crash the flow.
 */
export async function safeExecute<T>(
  fn: () => Promise<T>,
  fallback: T,
  label = 'operation',
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logger.warn(`[SafeExec] ${label} failed: ${err instanceof Error ? err.message : err}`);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------

/**
 * Validates that a string is a non-empty UUID-like ID.
 */
export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 64;
}

/**
 * Validates that a value is a valid URL string.
 */
export function isValidUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clamps a number to a range.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Sleep
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
