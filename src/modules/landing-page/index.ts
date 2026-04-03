/**
 * Módulo: Landing Page Engine
 *
 * Transforma narrativas, fontes, assets e branding em planos
 * de landing page orientados à conversão (modelo AIDA).
 *
 * Pipeline interno:
 * 1. Identificar OutputDecisions de landing page aprovadas
 * 2. Localizar NarrativePlans de landing page
 * 3. Construir seções com papel de conversão (AIDA)
 * 4. Resolver branding colors e hero asset
 * 5. Definir lead capture intents e conversion flow
 * 6. Salvar LandingPagePlan[] no context.landingPagePlans
 *
 * Os LandingPagePlans são consumidos por renderizadores futuros:
 * - HTML/CSS builder (página standalone)
 * - React/Next.js generator
 * - Template engine com formulário
 *
 * v1: plano estruturado. v2: renderização de página real.
 */

import { PipelineStage } from '../../domain/value-objects/index.js';
import type { LandingPagePlan } from '../../domain/entities/landing-page-plan.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { logger } from '../../utils/logger.js';

import { buildLandingPagePlans } from './lp-plan-builder.js';

export class LandingPageModule implements IModule {
  readonly stage = PipelineStage.MEDIA_GENERATION;
  readonly name = 'Landing Page Engine';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const decisions = context.selectedOutputs ?? [];
    const narratives = context.narratives ?? [];
    const sources = context.sources ?? [];
    const branding = context.branding;

    logger.info(
      `[LandingPage] Iniciando com ${decisions.length} decisões, ` +
        `${narratives.length} narrativas, ${sources.length} fontes`,
    );

    if (decisions.length === 0 || narratives.length === 0) {
      logger.warn('[LandingPage] Sem decisões ou narrativas — nenhum LP plan gerado');
      return { ...context, landingPagePlans: [] };
    }

    // --- Build landing page plans ---
    const plans = buildLandingPagePlans(decisions, narratives, sources, branding);

    if (plans.length === 0) {
      logger.info('[LandingPage] Nenhum output de landing page aprovado — módulo finalizado');
      return { ...context, landingPagePlans: [] };
    }

    // --- Log ---
    logLPSummary(plans);

    return {
      ...context,
      landingPagePlans: plans,
    };
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function logLPSummary(plans: LandingPagePlan[]): void {
  logger.info(`[LandingPage] ${plans.length} landing page plan(s) gerado(s)`);

  for (const plan of plans) {
    const sectionCount = plan.sections.length;
    const assetCount = new Set(
      plan.sections.flatMap((s) => s.assetIds),
    ).size;
    const ctaSections = plan.sections.filter(
      (s) => s.sectionType === 'cta-form' || s.sectionType === 'cta-inline',
    ).length;

    logger.info(`[LandingPage]   "${plan.title}"`);
    logger.info(`[LandingPage]     slug: ${plan.slug}`);
    logger.info(
      `[LandingPage]     ${sectionCount} seções, ${assetCount} assets, ` +
        `${ctaSections} CTAs, tom=${plan.tone}, confiança=${plan.confidence}`,
    );
    logger.info(
      `[LandingPage]     captação: ${plan.leadCaptureIntents.join(', ')}`,
    );
    logger.info(
      `[LandingPage]     fluxo: ${plan.conversionFlow}`,
    );

    for (const section of plan.sections) {
      logger.info(
        `[LandingPage]       [${section.sectionType}/${section.conversionRole}] ` +
          `"${section.heading}" (${section.assetIds.length} assets, ` +
          `${section.contentPoints.length} pontos)`,
      );
    }
  }
}

// Re-exports
export { buildLandingPagePlans } from './lp-plan-builder.js';
export { buildLPSections } from './lp-section-builder.js';
