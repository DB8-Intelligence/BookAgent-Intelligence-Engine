/**
 * Módulo: Blog Engine
 *
 * Transforma narrativas, fontes e contexto editorial em planos
 * de artigo estruturados para blog, com potencial de SEO,
 * autoridade e conversão.
 *
 * Pipeline interno:
 * 1. Identificar OutputDecisions de blog aprovadas
 * 2. Localizar NarrativePlans de blog correspondentes
 * 3. Construir BlogPlan com seções, introdução, conclusão, CTA
 * 4. Gerar metadados SEO (título, slug, meta description, keywords)
 * 5. Salvar BlogPlan[] no context.blogPlans
 *
 * Os BlogPlans são consumidos por renderizadores futuros:
 * - Markdown generator (artigo em .md)
 * - HTML builder (artigo em .html com estilos)
 * - IAIAdapter para refinamento de copy (v2)
 *
 * v1: plano editorial estruturado. v2: geração de texto final.
 */

import { PipelineStage } from '../../domain/value-objects/index.js';
import type { BlogPlan } from '../../domain/entities/blog-plan.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { logger } from '../../utils/logger.js';

import { buildBlogPlans } from './blog-plan-builder.js';

export class BlogModule implements IModule {
  readonly stage = PipelineStage.MEDIA_GENERATION;
  readonly name = 'Blog Engine';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const decisions = context.selectedOutputs ?? [];
    const narratives = context.narratives ?? [];
    const sources = context.sources ?? [];

    logger.info(
      `[Blog] Iniciando com ${decisions.length} decisões, ` +
        `${narratives.length} narrativas, ${sources.length} fontes`,
    );

    if (decisions.length === 0 || narratives.length === 0) {
      logger.warn('[Blog] Sem decisões ou narrativas — nenhum blog plan gerado');
      return { ...context, blogPlans: [] };
    }

    // --- Build blog plans ---
    const plans = buildBlogPlans(decisions, narratives, sources);

    if (plans.length === 0) {
      logger.info('[Blog] Nenhum output de blog aprovado — módulo finalizado');
      return { ...context, blogPlans: [] };
    }

    // --- Log ---
    logBlogSummary(plans);

    return {
      ...context,
      blogPlans: plans,
    };
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function logBlogSummary(plans: BlogPlan[]): void {
  logger.info(`[Blog] ${plans.length} blog plan(s) gerado(s)`);

  for (const plan of plans) {
    const sectionCount = plan.sections.length;
    const assetCount = new Set(
      plan.sections.flatMap((s) => s.assetIds),
    ).size;

    logger.info(
      `[Blog]   "${plan.title}"`,
    );
    logger.info(
      `[Blog]     slug: ${plan.slug}`,
    );
    logger.info(
      `[Blog]     ${sectionCount} seções, ~${plan.estimatedWordCount} palavras, ` +
        `${assetCount} assets, tom=${plan.tone}, confiança=${plan.confidence}`,
    );
    logger.info(
      `[Blog]     keywords: ${plan.keywords.slice(0, 8).join(', ')}`,
    );

    for (const section of plan.sections) {
      logger.info(
        `[Blog]       [${section.editorialRole}] "${section.heading}" ` +
          `(~${section.estimatedWordCount} palavras, ${section.draftPoints.length} pontos)`,
      );
    }
  }
}

// Re-exports
export { buildBlogPlans } from './blog-plan-builder.js';
export {
  buildSections,
  extractIntroduction,
  extractConclusion,
  extractCTA,
} from './section-builder.js';
