/**
 * Cost Estimator — Performance & Cost Control Engine
 *
 * Estima custos do job a partir de execution logs e métricas.
 * Suporta múltiplos providers de IA, TTS e render.
 *
 * Parte 71: Performance & Cost Control Engine
 */

import type { ModuleExecutionLog } from '../../domain/entities/module-log.js';
import type { ExportResult } from '../../domain/entities/export-artifact.js';
import type { MediaPlan } from '../../domain/entities/media-plan.js';
import { PipelineStage } from '../../domain/value-objects/index.js';
import type {
  JobCost,
  CostBreakdown,
  CostLineItem,
  UsageMetrics,
  PlanCostLimits,
} from '../../domain/entities/job-cost.js';
import {
  CostCategory,
  CostAlert,
  PLAN_LIMITS,
  OPERATION_RATES,
  determineCostAlert,
} from '../../domain/entities/job-cost.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CostEstimationInput {
  jobId: string;
  planType: string;
  executionLogs: ModuleExecutionLog[];
  mediaPlans?: MediaPlan[];
  exportResult?: ExportResult;
  narrativeCount: number;
  blogCount: number;
  landingPageCount: number;
}

/**
 * Estima o custo total de um job baseado nos dados disponíveis.
 */
export function estimateJobCost(input: CostEstimationInput): JobCost {
  const items: CostLineItem[] = [];
  const alerts: string[] = [];

  // --- AI calls estimation ---
  const aiItems = estimateAiCosts(input);
  items.push(...aiItems);

  // --- TTS estimation ---
  const ttsItems = estimateTtsCosts(input);
  items.push(...ttsItems);

  // --- Render estimation ---
  const renderItems = estimateRenderCosts(input);
  items.push(...renderItems);

  // --- Storage estimation ---
  const storageItems = estimateStorageCosts(input);
  items.push(...storageItems);

  // --- Build breakdown ---
  const totalCostUsd = items.reduce((sum, i) => sum + i.estimatedCostUsd, 0);
  const topItem = items.length > 0
    ? items.reduce((max, i) => i.estimatedCostUsd > max.estimatedCostUsd ? i : max)
    : null;

  const breakdown: CostBreakdown = {
    items,
    totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
    topCategory: topItem?.category ?? CostCategory.AI_TEXT,
    topProvider: topItem?.provider ?? 'unknown',
  };

  // --- Usage metrics ---
  const usage = buildUsageMetrics(input, items);

  // --- Plan limits ---
  const planLimits = PLAN_LIMITS[input.planType] ?? PLAN_LIMITS['basic']!;
  const limitUsagePercent = planLimits.maxCostUsd > 0
    ? Math.round((totalCostUsd / planLimits.maxCostUsd) * 100)
    : 0;

  // --- Alerts ---
  const alert = determineCostAlert(totalCostUsd, planLimits.maxCostUsd);

  if (alert === CostAlert.CRITICAL) {
    alerts.push(`Custo ($${totalCostUsd.toFixed(4)}) próximo do limite do plano ($${planLimits.maxCostUsd})`);
  }
  if (alert === CostAlert.WARNING) {
    alerts.push(`Custo em 70%+ do limite do plano`);
  }

  // Check individual limits
  checkUsageLimits(usage, planLimits, alerts);

  // Check execution time
  const totalExecMs = usage.totalExecutionMs;
  if (totalExecMs > 120_000) {
    alerts.push(`Tempo de execução alto: ${Math.round(totalExecMs / 1000)}s`);
  }

  return {
    jobId: input.jobId,
    totalCostUsd: breakdown.totalCostUsd,
    breakdown,
    usage,
    planLimitUsd: planLimits.maxCostUsd,
    limitUsagePercent,
    alert,
    alerts,
    evaluatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// AI Cost Estimation
// ---------------------------------------------------------------------------

function estimateAiCosts(input: CostEstimationInput): CostLineItem[] {
  const items: CostLineItem[] = [];

  // Estimate based on pipeline stages that use AI
  const aiStages: PipelineStage[] = [
    PipelineStage.NARRATIVE,
    PipelineStage.OUTPUT_SELECTION,
    PipelineStage.MEDIA_GENERATION,
    PipelineStage.BLOG,
    PipelineStage.LANDING_PAGE,
    PipelineStage.PERSONALIZATION,
  ];

  let totalAiCalls = 0;
  let totalDurationMs = 0;

  for (const log of input.executionLogs) {
    if (aiStages.includes(log.stage)) {
      totalAiCalls++;
      totalDurationMs += log.durationMs;
    }
  }

  // Estimate tokens: ~2000 input + 1000 output per AI call (conservative)
  const estInputTokens = totalAiCalls * 2000;
  const estOutputTokens = totalAiCalls * 1000;

  // Default to a mid-range model for estimation
  const rate = 0.003; // ~$3/1M input tokens (Claude Sonnet range)
  const outputRate = 0.015;
  const cost = (estInputTokens / 1000) * rate + (estOutputTokens / 1000) * outputRate;

  if (totalAiCalls > 0) {
    items.push({
      category: CostCategory.AI_TEXT,
      provider: 'estimated',
      count: totalAiCalls,
      estimatedCostUsd: Math.round(cost * 10000) / 10000,
      tokensInput: estInputTokens,
      tokensOutput: estOutputTokens,
      durationMs: totalDurationMs,
    });
  }

  // Vision calls (asset extraction, correlation)
  const visionStages: PipelineStage[] = [
    PipelineStage.EXTRACTION,
    PipelineStage.CORRELATION,
    PipelineStage.BRANDING,
  ];
  let visionCalls = 0;
  for (const log of input.executionLogs) {
    if (visionStages.includes(log.stage)) {
      visionCalls++;
    }
  }

  if (visionCalls > 0) {
    items.push({
      category: CostCategory.AI_VISION,
      provider: 'estimated',
      count: visionCalls,
      estimatedCostUsd: visionCalls * 0.005, // ~$0.005 per vision call
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// TTS Cost Estimation
// ---------------------------------------------------------------------------

function estimateTtsCosts(input: CostEstimationInput): CostLineItem[] {
  const items: CostLineItem[] = [];

  // Check if audio was generated (render_export stage handles audio)
  const audioLog = input.executionLogs.find((l) => l.stage === PipelineStage.RENDER_EXPORT);
  if (!audioLog) return items;

  // Estimate: narratives with audio get TTS
  const narrativesWithAudio = input.narrativeCount; // simplified
  if (narrativesWithAudio > 0) {
    const costPerCall = OPERATION_RATES['tts:google'] ?? 0.004;
    items.push({
      category: CostCategory.TTS,
      provider: 'estimated',
      count: narrativesWithAudio,
      estimatedCostUsd: narrativesWithAudio * costPerCall,
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Render Cost Estimation
// ---------------------------------------------------------------------------

function estimateRenderCosts(input: CostEstimationInput): CostLineItem[] {
  const items: CostLineItem[] = [];

  const mediaPlans = input.mediaPlans ?? [];
  let videoShortCount = 0;
  let videoLongCount = 0;
  let imageCount = 0;

  for (const plan of mediaPlans) {
    const format = plan.format;
    if (format === 'reel' || format === 'video_short' || format === 'story') {
      videoShortCount++;
    } else if (format === 'video_long') {
      videoLongCount++;
    } else {
      imageCount++;
    }
  }

  if (videoShortCount > 0) {
    items.push({
      category: CostCategory.VIDEO_RENDER,
      provider: 'ffmpeg',
      count: videoShortCount,
      estimatedCostUsd: videoShortCount * (OPERATION_RATES['render:video_short'] ?? 0.02),
    });
  }

  if (videoLongCount > 0) {
    items.push({
      category: CostCategory.VIDEO_RENDER,
      provider: 'ffmpeg',
      count: videoLongCount,
      estimatedCostUsd: videoLongCount * (OPERATION_RATES['render:video_long'] ?? 0.05),
    });
  }

  if (imageCount > 0) {
    items.push({
      category: CostCategory.IMAGE_RENDER,
      provider: 'sharp',
      count: imageCount,
      estimatedCostUsd: imageCount * (OPERATION_RATES['render:image'] ?? 0.005),
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Storage Cost Estimation
// ---------------------------------------------------------------------------

function estimateStorageCosts(input: CostEstimationInput): CostLineItem[] {
  const items: CostLineItem[] = [];

  const exportResult = input.exportResult;
  if (!exportResult) return items;

  // Estimate based on artifact count
  const artifactCount = exportResult.artifacts?.length ?? 0;
  const estimatedBytes = artifactCount * 5_000_000; // ~5MB per artifact average

  if (artifactCount > 0) {
    items.push({
      category: CostCategory.STORAGE,
      provider: 'supabase',
      count: artifactCount,
      estimatedCostUsd: (estimatedBytes / (1024 * 1024 * 1024)) * 0.021, // ~$0.021/GB/month
      bytesProcessed: estimatedBytes,
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Usage Metrics
// ---------------------------------------------------------------------------

function buildUsageMetrics(
  input: CostEstimationInput,
  items: CostLineItem[],
): UsageMetrics {
  const aiCalls = items
    .filter((i) => i.category === CostCategory.AI_TEXT || i.category === CostCategory.AI_VISION)
    .reduce((sum, i) => sum + i.count, 0);

  const totalTokens = items
    .filter((i) => i.category === CostCategory.AI_TEXT)
    .reduce((sum, i) => sum + (i.tokensInput ?? 0) + (i.tokensOutput ?? 0), 0);

  const videoRenderCount = items
    .filter((i) => i.category === CostCategory.VIDEO_RENDER)
    .reduce((sum, i) => sum + i.count, 0);

  const imageRenderCount = items
    .filter((i) => i.category === CostCategory.IMAGE_RENDER)
    .reduce((sum, i) => sum + i.count, 0);

  const ttsCallCount = items
    .filter((i) => i.category === CostCategory.TTS)
    .reduce((sum, i) => sum + i.count, 0);

  const totalFileSizeBytes = items
    .filter((i) => i.bytesProcessed)
    .reduce((sum, i) => sum + (i.bytesProcessed ?? 0), 0);

  // Stage timings from execution logs
  const stageTimings: Record<string, number> = {};
  let totalExecutionMs = 0;

  for (const log of input.executionLogs) {
    stageTimings[log.stage] = log.durationMs;
    totalExecutionMs += log.durationMs;
  }

  return {
    aiCallCount: aiCalls,
    totalTokens,
    videoRenderCount,
    imageRenderCount,
    ttsCallCount,
    totalFileSizeBytes,
    totalExecutionMs,
    stageTimings,
  };
}

// ---------------------------------------------------------------------------
// Limit Checks
// ---------------------------------------------------------------------------

function checkUsageLimits(
  usage: UsageMetrics,
  limits: PlanCostLimits,
  alerts: string[],
): void {
  if (usage.aiCallCount > limits.maxAiCalls) {
    alerts.push(`AI calls (${usage.aiCallCount}) excedem limite do plano (${limits.maxAiCalls})`);
  }
  if (usage.videoRenderCount + usage.imageRenderCount > limits.maxRenders) {
    alerts.push(`Renders (${usage.videoRenderCount + usage.imageRenderCount}) excedem limite do plano (${limits.maxRenders})`);
  }
  if (usage.ttsCallCount > limits.maxTtsCalls) {
    alerts.push(`TTS calls (${usage.ttsCallCount}) excedem limite do plano (${limits.maxTtsCalls})`);
  }
  const fileSizeMb = usage.totalFileSizeBytes / (1024 * 1024);
  if (fileSizeMb > limits.maxFileSizeMb) {
    alerts.push(`Tamanho de arquivos (${Math.round(fileSizeMb)}MB) excede limite do plano (${limits.maxFileSizeMb}MB)`);
  }
}
