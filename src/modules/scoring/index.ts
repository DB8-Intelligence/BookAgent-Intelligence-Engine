/**
 * Módulo: Content Scoring Engine
 *
 * Avalia automaticamente a qualidade dos outputs antes da entrega.
 * Score de 0-100 por dimensão (TEXT, VISUAL, NARRATIVE, TECHNICAL).
 *
 * Não bloqueia o pipeline — apenas marca outputs com:
 *   - approved_for_delivery (score >= 50)
 *   - needs_revision (score < 50)
 *
 * Pipeline interno:
 *   1. Avaliar MediaPlans
 *   2. Avaliar NarrativePlans
 *   3. Avaliar BlogPlans
 *   4. Consolidar scores no context
 *
 * Parte 70: Content Quality & Scoring Engine
 */

import { PipelineStage } from '../../domain/value-objects/index.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import type { ContentScore } from '../../domain/entities/content-score.js';
import { QualityDecision } from '../../domain/entities/content-score.js';
import { logger } from '../../utils/logger.js';

import { scoreMediaPlan, scoreNarrativePlan, scoreBlogPlan } from './score-evaluator.js';

export class ContentScoringModule implements IModule {
  readonly stage = PipelineStage.CONTENT_SCORING;
  readonly name = 'Content Scoring Engine';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const scores: ContentScore[] = [];

    // --- Score MediaPlans ---
    const mediaPlans = context.mediaPlans ?? [];
    const narratives = context.narratives ?? [];

    for (const plan of mediaPlans) {
      // Find matching narrative for this plan
      const narrative = narratives.find((n) => n.id === plan.narrativePlanId);
      const score = scoreMediaPlan(plan, narrative);
      scores.push(score);
    }

    // --- Score NarrativePlans ---
    for (const narrative of narratives) {
      const score = scoreNarrativePlan(narrative);
      scores.push(score);
    }

    // --- Score BlogPlans ---
    const blogPlans = context.blogPlans ?? [];
    for (const blog of blogPlans) {
      const score = scoreBlogPlan(blog);
      scores.push(score);
    }

    // --- Log summary ---
    const approved = scores.filter((s) => s.decision === QualityDecision.APPROVED_FOR_DELIVERY).length;
    const needsRevision = scores.filter((s) => s.decision === QualityDecision.NEEDS_REVISION).length;
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
      : 0;

    logger.info(
      `[ContentScoring] ${scores.length} outputs avaliados: ` +
      `avg=${avgScore} approved=${approved} needs_revision=${needsRevision}`,
    );

    for (const score of scores) {
      const weakPoints = score.breakdown.weakPoints
        .map((w) => `${w.name}(${w.score})`)
        .join(', ');

      logger.info(
        `[ContentScoring]   ${score.targetType}/${score.targetId.substring(0, 8)}: ` +
        `score=${score.score} level=${score.level} decision=${score.decision}` +
        (weakPoints ? ` weak=[${weakPoints}]` : ''),
      );
    }

    return {
      ...context,
      scores,
    };
  }
}

// Re-exports
export { scoreMediaPlan, scoreNarrativePlan, scoreBlogPlan } from './score-evaluator.js';
