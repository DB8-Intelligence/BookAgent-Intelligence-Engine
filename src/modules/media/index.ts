/**
 * Módulo: Media Engine
 *
 * Transforma outputs aprovados, narrativas, assets e branding em
 * MediaPlans concretos — estruturas de cenas/slides prontas para
 * renderização futura.
 *
 * Pipeline interno:
 * 1. Filtrar OutputDecisions aprovadas que são de mídia visual
 * 2. Para cada uma, localizar o NarrativePlan correspondente
 * 3. Compor cenas com assets, textos, branding e layout
 * 4. Avaliar render readiness de cada plano
 * 5. Salvar MediaPlan[] no context.mediaPlans
 *
 * Os MediaPlans são consumidos por renderizadores futuros:
 * - sharp/canvas para composição de imagens (carousel, post, story)
 * - ffmpeg para composição de vídeo (reel, video)
 * - pptx-gen para apresentações
 *
 * v1: estrutura de planos. v2: renderização real.
 */

import { PipelineStage } from '../../domain/value-objects/index.js';
import type { MediaPlan } from '../../domain/entities/media-plan.js';
import { RenderStatus } from '../../domain/entities/media-plan.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { logger } from '../../utils/logger.js';

import { buildMediaPlans } from './media-plan-builder.js';

export class MediaGenerationModule implements IModule {
  readonly stage = PipelineStage.MEDIA_GENERATION;
  readonly name = 'Media Engine';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const decisions = context.selectedOutputs ?? [];
    const narratives = context.narratives ?? [];
    const sources = context.sources ?? [];
    const assets = context.assets ?? [];
    const branding = context.branding;

    logger.info(
      `[Media] Iniciando com ${decisions.length} decisões, ` +
        `${narratives.length} narrativas, ${assets.length} assets`,
    );

    if (decisions.length === 0 || narratives.length === 0) {
      logger.warn('[Media] Sem decisões ou narrativas — nenhum media plan gerado');
      return { ...context, mediaPlans: [], outputs: [] };
    }

    // --- Build media plans ---
    const plans = buildMediaPlans(decisions, narratives, sources, assets, branding);

    // --- Log ---
    logMediaSummary(plans);

    return {
      ...context,
      mediaPlans: plans,
      outputs: [], // Outputs finais serão populados quando renderização real existir
    };
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function logMediaSummary(plans: MediaPlan[]): void {
  logger.info(`[Media] ${plans.length} media plans gerados`);

  const byStatus = new Map<RenderStatus, number>();
  let totalScenes = 0;

  for (const plan of plans) {
    byStatus.set(plan.renderStatus, (byStatus.get(plan.renderStatus) ?? 0) + 1);
    totalScenes += plan.scenes.length;

    const sizeInfo = plan.totalDurationSeconds
      ? `${plan.totalDurationSeconds}s`
      : `${plan.totalSlides} slides`;

    const assetsInPlan = new Set(plan.scenes.flatMap((s) => s.assetIds)).size;

    logger.info(
      `[Media]   ${plan.format} (${plan.narrativeType}): ` +
        `${plan.scenes.length} cenas, ${sizeInfo}, ` +
        `${assetsInPlan} assets, render=${plan.renderStatus}`,
    );
  }

  const statusStr = [...byStatus.entries()]
    .map(([status, count]) => `${status}:${count}`)
    .join(', ');

  logger.info(
    `[Media] Total: ${totalScenes} cenas, status: ${statusStr}`,
  );
}

// Re-exports
export { composeScenes } from './scene-composer.js';
export { buildMediaPlans } from './media-plan-builder.js';
