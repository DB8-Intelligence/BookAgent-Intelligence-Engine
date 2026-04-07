/**
 * Módulo: Performance & Cost Control Engine
 *
 * Monitora custo e performance de cada job.
 * Estima custos por provider, gera alertas e otimiza execução.
 *
 * Pipeline interno:
 *   1. Coletar métricas de execution logs
 *   2. Estimar custos por provider
 *   3. Comparar com limites do plano
 *   4. Gerar alertas
 *   5. Salvar em context.costMetrics
 *
 * Parte 71: Performance & Cost Control Engine
 */

import { PipelineStage } from '../../domain/value-objects/index.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { CostAlert } from '../../domain/entities/job-cost.js';
import { logger } from '../../utils/logger.js';

import { estimateJobCost } from './cost-estimator.js';

export class PerformanceMonitoringModule implements IModule {
  readonly stage = PipelineStage.PERFORMANCE_MONITORING;
  readonly name = 'Performance & Cost Engine';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const userCtx = context.input.userContext as Record<string, unknown> | undefined;
    const planType = (typeof userCtx?.plan === 'string' ? userCtx.plan : 'basic');

    const jobCost = estimateJobCost({
      jobId: context.jobId,
      planType,
      executionLogs: context.executionLogs ?? [],
      mediaPlans: context.mediaPlans,
      exportResult: context.exportResult,
      narrativeCount: context.narratives?.length ?? 0,
      blogCount: context.blogPlans?.length ?? 0,
      landingPageCount: context.landingPagePlans?.length ?? 0,
    });

    // --- Log ---
    logger.info(
      `[Performance] Job ${context.jobId}: ` +
      `cost=$${jobCost.totalCostUsd.toFixed(4)} ` +
      `limit=$${jobCost.planLimitUsd} (${jobCost.limitUsagePercent}%) ` +
      `alert=${jobCost.alert}`,
    );

    if (jobCost.usage.totalExecutionMs > 0) {
      const topStages = Object.entries(jobCost.usage.stageTimings)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([stage, ms]) => `${stage}=${ms}ms`)
        .join(', ');

      logger.info(
        `[Performance]   execution=${Math.round(jobCost.usage.totalExecutionMs / 1000)}s ` +
        `ai_calls=${jobCost.usage.aiCallCount} renders=${jobCost.usage.videoRenderCount + jobCost.usage.imageRenderCount} ` +
        `top=[${topStages}]`,
      );
    }

    for (const alert of jobCost.alerts) {
      if (jobCost.alert === CostAlert.CRITICAL) {
        logger.error(`[Performance] ALERTA: ${alert}`);
      } else {
        logger.warn(`[Performance] Aviso: ${alert}`);
      }
    }

    return {
      ...context,
      costMetrics: jobCost,
    };
  }
}

// Re-exports
export { estimateJobCost } from './cost-estimator.js';
