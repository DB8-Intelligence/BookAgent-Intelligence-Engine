/**
 * Aggregator — Learning Engine
 *
 * Consolida sinais de aprendizado em agregações estatísticas.
 * Identifica padrões: melhores presets, durações, layouts.
 *
 * Estratégia:
 *   1. Agrupa sinais por chave (ex: "preset:luxury", "format:reel")
 *   2. Calcula média, mediana, desvio padrão
 *   3. Detecta tendência (improving/declining/stable)
 *   4. Calcula confiança baseada em sample size
 *
 * Parte 73: Learning Engine
 */

import type {
  LearningSignal,
  FeedbackAggregate,
} from '../../domain/entities/learning.js';
import {
  OptimizationCategory,
  MIN_SIGNALS_FOR_AGGREGATE,
} from '../../domain/entities/learning.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Aggregate Signals
// ---------------------------------------------------------------------------

/**
 * Agrega sinais por chave e produz FeedbackAggregate[].
 */
export function aggregateSignals(signals: LearningSignal[]): FeedbackAggregate[] {
  const groups = groupSignals(signals);
  const aggregates: FeedbackAggregate[] = [];

  for (const [key, group] of groups) {
    if (group.length < MIN_SIGNALS_FOR_AGGREGATE) continue;

    const values = group.map((s) => s.value * s.weight);
    const sorted = [...values].sort((a, b) => a - b);

    const avg = mean(values);
    const med = median(sorted);
    const std = stdDev(values, avg);
    const confidence = sampleConfidence(group.length);

    // Detect trend from chronological values
    const trend = detectTrend(group);

    // Infer category and output format
    const category = inferCategory(key);
    const outputFormat = group[0]?.outputFormat;

    aggregates.push({
      key,
      category,
      outputFormat,
      sampleSize: group.length,
      averageScore: round(avg),
      medianScore: round(med),
      stdDeviation: round(std),
      minScore: sorted[0] ?? 0,
      maxScore: sorted[sorted.length - 1] ?? 0,
      trend,
      confidence: round(confidence),
      updatedAt: new Date(),
    });
  }

  logger.info(
    `[Aggregator] Produced ${aggregates.length} aggregates from ${signals.length} signals`,
  );

  return aggregates;
}

/**
 * Identifica os top performers por categoria.
 */
export function findTopPerformers(
  aggregates: FeedbackAggregate[],
  category: OptimizationCategory,
  limit: number = 3,
): FeedbackAggregate[] {
  return aggregates
    .filter((a) => a.category === category && a.confidence >= 0.5)
    .sort((a, b) => b.averageScore - a.averageScore)
    .slice(0, limit);
}

/**
 * Identifica os worst performers por categoria.
 */
export function findWorstPerformers(
  aggregates: FeedbackAggregate[],
  category: OptimizationCategory,
  limit: number = 3,
): FeedbackAggregate[] {
  return aggregates
    .filter((a) => a.category === category && a.confidence >= 0.5)
    .sort((a, b) => a.averageScore - b.averageScore)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function groupSignals(signals: LearningSignal[]): Map<string, LearningSignal[]> {
  const groups = new Map<string, LearningSignal[]>();

  for (const signal of signals) {
    const keys = deriveKeys(signal);
    for (const key of keys) {
      const group = groups.get(key) ?? [];
      group.push(signal);
      groups.set(key, group);
    }
  }

  return groups;
}

/**
 * Deriva chaves de agregação a partir do contexto do sinal.
 * Um sinal pode contribuir para múltiplas agregações.
 */
function deriveKeys(signal: LearningSignal): string[] {
  const keys: string[] = [];
  const ctx = signal.context;

  // By format
  if (signal.outputFormat) {
    keys.push(`format:${signal.outputFormat}`);
  }

  // By dimension
  if (signal.dimension !== 'overall') {
    keys.push(`dimension:${signal.dimension}`);
  }

  // By preset (from context)
  if (typeof ctx.presetId === 'string') {
    keys.push(`preset:${ctx.presetId}`);
  }

  // By layout (from context)
  if (typeof ctx.dominantLayout === 'string') {
    keys.push(`layout:${ctx.dominantLayout}`);
  }

  // By duration bucket
  if (typeof ctx.bucket === 'string') {
    keys.push(`duration:${ctx.bucket}`);
  }

  // By channel
  if (typeof ctx.channel === 'string') {
    keys.push(`channel:${ctx.channel}`);
  }

  // By tone
  if (typeof ctx.tone === 'string') {
    keys.push(`tone:${ctx.tone}`);
  }

  // Fallback: source + dimension
  if (keys.length === 0) {
    keys.push(`${signal.source}:${signal.dimension}`);
  }

  return keys;
}

// ---------------------------------------------------------------------------
// Category Inference
// ---------------------------------------------------------------------------

function inferCategory(key: string): OptimizationCategory {
  const prefix = key.split(':')[0] ?? '';

  switch (prefix) {
    case 'preset':
      return OptimizationCategory.PRESET;
    case 'duration':
      return OptimizationCategory.DURATION;
    case 'layout':
      return OptimizationCategory.LAYOUT;
    case 'format':
      return OptimizationCategory.FORMAT;
    case 'tone':
      return OptimizationCategory.TONE;
    case 'channel':
      return OptimizationCategory.FORMAT; // channel maps to format decisions
    default:
      return OptimizationCategory.FORMAT;
  }
}

// ---------------------------------------------------------------------------
// Trend Detection
// ---------------------------------------------------------------------------

function detectTrend(
  signals: LearningSignal[],
): 'improving' | 'declining' | 'stable' {
  if (signals.length < 3) return 'stable';

  // Split into two halves by time
  const sorted = [...signals].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid).map((s) => s.value);
  const secondHalf = sorted.slice(mid).map((s) => s.value);

  const avgFirst = mean(firstHalf);
  const avgSecond = mean(secondHalf);

  const diff = avgSecond - avgFirst;
  const threshold = Math.max(avgFirst * 0.1, 3); // 10% or 3 points

  if (diff > threshold) return 'improving';
  if (diff < -threshold) return 'declining';
  return 'stable';
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

function sampleConfidence(sampleSize: number): number {
  // Logarithmic confidence: reaches ~0.9 at 50 samples
  if (sampleSize < MIN_SIGNALS_FOR_AGGREGATE) return 0;
  return Math.min(0.95, Math.log10(sampleSize) / Math.log10(100));
}

function round(value: number, decimals: number = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
