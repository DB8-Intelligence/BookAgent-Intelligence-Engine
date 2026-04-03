/**
 * Módulo: Narrative Engine
 *
 * Transforma Source[] priorizadas em NarrativePlan[] — sequências
 * narrativas estruturadas para cada tipo de output.
 *
 * Pipeline interno:
 * 1. Verificar sources disponíveis no contexto
 * 2. Gerar NarrativePlans para todos os tipos de output viáveis
 * 3. Ordenar planos por confiança
 * 4. Salvar no context.narratives
 *
 * Cada NarrativePlan contém beats ordenados com:
 * - Papel narrativo (hook, showcase, differentiator, closing, CTA)
 * - Source associada
 * - Headline sugerida
 * - Briefing customizado
 * - Assets sugeridos
 * - Duração estimada
 *
 * Esses planos são consumidos por output-selection (para decidir
 * quais outputs gerar) e pelos módulos de geração (media, blog,
 * landing-page) que transformam os planos em conteúdo final.
 */

import { PipelineStage } from '../../domain/value-objects/index.js';
import type { NarrativePlan } from '../../domain/entities/narrative.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { logger } from '../../utils/logger.js';

import { generateNarrativePlans } from './narrative-planner.js';

export class NarrativeModule implements IModule {
  readonly stage = PipelineStage.NARRATIVE;
  readonly name = 'Narrative Engine';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const sources = context.sources ?? [];

    logger.info(`[Narrative] Iniciando com ${sources.length} fontes`);

    if (sources.length === 0) {
      logger.warn('[Narrative] Sem fontes — nenhum plano narrativo gerado');
      return { ...context, narratives: [] };
    }

    // --- Gerar planos para todos os tipos viáveis ---
    const plans = generateNarrativePlans(sources);

    // --- Ordenar por confiança (maior primeiro) ---
    plans.sort((a, b) => b.confidence - a.confidence);

    // --- Log ---
    logNarrativeSummary(plans, sources.length);

    return {
      ...context,
      narratives: plans,
    };
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function logNarrativeSummary(plans: NarrativePlan[], sourceCount: number): void {
  logger.info(
    `[Narrative] ${plans.length} planos narrativos gerados a partir de ${sourceCount} fontes`,
  );

  for (const plan of plans) {
    const filledBeats = plan.beats.length;
    const withVisuals = plan.beats.filter((b) => b.showVisuals).length;
    const uniqueSources = plan.sourceIds.length;

    let sizeInfo = '';
    if (plan.estimatedDurationSeconds) {
      sizeInfo = `~${plan.estimatedDurationSeconds}s`;
    } else if (plan.estimatedSlides) {
      sizeInfo = `~${plan.estimatedSlides} slides`;
    } else if (plan.estimatedWordCount) {
      sizeInfo = `~${plan.estimatedWordCount} palavras`;
    }

    logger.info(
      `[Narrative]   ${plan.narrativeType}: ${filledBeats} beats ` +
        `(${withVisuals} visuais), ${uniqueSources} fontes, ` +
        `confiança=${plan.confidence}, tom=${plan.tone}` +
        (sizeInfo ? `, ${sizeInfo}` : ''),
    );
  }
}

// Re-exports
export { generateNarrativePlans, generatePlanForFormat } from './narrative-planner.js';
export { NARRATIVE_TEMPLATES, FORMAT_TO_NARRATIVE } from './narrative-templates.js';
