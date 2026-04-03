/**
 * Módulo: Output Selection Engine
 *
 * Avalia NarrativePlan[], Source[], Asset[] e BrandingProfile para
 * decidir quais outputs são viáveis, prioritários e aprovados.
 *
 * Pipeline interno:
 * 1. Para cada NarrativePlan, avaliar viabilidade (feasibility)
 * 2. Converter avaliação em OutputDecision com status e gaps
 * 3. Priorizar outputs aprovados e detectar redundâncias
 * 4. Salvar OutputDecision[] no context.selectedOutputs
 *
 * Os módulos de geração (media, blog, landing-page) consumirão
 * apenas as decisions com status APPROVED ou APPROVED_WITH_GAPS,
 * respeitando a prioridade atribuída.
 */

import { v4 as uuid } from 'uuid';
import { PipelineStage } from '../../domain/value-objects/index.js';
import type { NarrativePlan } from '../../domain/entities/narrative.js';
import type { OutputDecision } from '../../domain/entities/output-decision.js';
import { ApprovalStatus } from '../../domain/entities/output-decision.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { logger } from '../../utils/logger.js';

import { evaluateFeasibility, determineApprovalStatus } from './feasibility-evaluator.js';
import { prioritizeOutputs } from './output-prioritizer.js';

export class OutputSelectionModule implements IModule {
  readonly stage = PipelineStage.OUTPUT_SELECTION;
  readonly name = 'Output Selection';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const narratives = context.narratives ?? [];
    const sources = context.sources ?? [];
    const assets = context.assets ?? [];

    logger.info(
      `[OutputSelection] Avaliando ${narratives.length} planos narrativos ` +
        `(${sources.length} fontes, ${assets.length} assets)`,
    );

    if (narratives.length === 0) {
      logger.warn('[OutputSelection] Sem planos narrativos — nenhum output selecionado');
      return { ...context, selectedOutputs: [] };
    }

    // --- Etapa 1: Avaliar viabilidade de cada plano ---
    const rawDecisions: OutputDecision[] = narratives.map((plan) =>
      evaluatePlan(plan, sources, assets),
    );

    // --- Etapa 2: Priorizar e detectar redundâncias ---
    const decisions = prioritizeOutputs(rawDecisions);

    // --- Log ---
    logSelectionSummary(decisions);

    return {
      ...context,
      selectedOutputs: decisions,
    };
  }
}

// ---------------------------------------------------------------------------
// Plan evaluation
// ---------------------------------------------------------------------------

function evaluatePlan(
  plan: NarrativePlan,
  sources: import('../../domain/entities/source.js').Source[],
  assets: import('../../domain/entities/asset.js').Asset[],
): OutputDecision {
  const feasibility = evaluateFeasibility(plan, sources, assets);
  const statusStr = determineApprovalStatus(feasibility.score, feasibility.gaps);

  const statusMap: Record<string, ApprovalStatus> = {
    'approved': ApprovalStatus.APPROVED,
    'approved-with-gaps': ApprovalStatus.APPROVED_WITH_GAPS,
    'rejected': ApprovalStatus.REJECTED,
  };

  const status = statusMap[statusStr] ?? ApprovalStatus.REJECTED;
  const reason = generateReason(status, plan, feasibility);

  return {
    id: uuid(),
    format: plan.targetFormat,
    narrativeType: plan.narrativeType,
    narrativePlanId: plan.id,
    status,
    priority: 0, // Será reatribuído pelo prioritizer
    confidence: Math.round(feasibility.score * 100) / 100,
    complexity: feasibility.complexity,
    gaps: feasibility.gaps,
    reason,
    requiredAssetCount: feasibility.requiredAssetCount,
    availableAssetCount: feasibility.availableAssetCount,
    requiredSourceTypes: feasibility.requiredSourceTypes,
    availableSourceTypes: feasibility.availableSourceTypes,
    totalBeats: feasibility.totalBeats,
    filledBeats: feasibility.filledBeats,
    requiredBeatsFilled: feasibility.requiredBeatsFilled,
    requiredBeatsTotal: feasibility.requiredBeatsTotal,
    requiresPersonalization: feasibility.requiresPersonalization,
  };
}

function generateReason(
  status: ApprovalStatus,
  plan: NarrativePlan,
  feasibility: ReturnType<typeof evaluateFeasibility>,
): string {
  if (status === ApprovalStatus.APPROVED) {
    return `Aprovado: ${plan.narrativeType} com ${feasibility.filledBeats}/${feasibility.totalBeats} beats, ` +
      `${feasibility.availableAssetCount} assets, confiança ${Math.round(feasibility.score * 100)}%`;
  }

  if (status === ApprovalStatus.APPROVED_WITH_GAPS) {
    const gapNames = feasibility.gaps.map((g) => g.criterion).join(', ');
    return `Aprovado com lacunas (${gapNames}): ${plan.narrativeType}, ` +
      `confiança ${Math.round(feasibility.score * 100)}%`;
  }

  // Rejected
  const blockingGaps = feasibility.gaps.filter((g) => g.blocking);
  if (blockingGaps.length > 0) {
    const blocking = blockingGaps.map((g) =>
      `${g.criterion}: requer ${g.required}, disponível ${g.actual}`
    ).join('; ');
    return `Rejeitado: ${plan.narrativeType} — ${blocking}`;
  }

  return `Rejeitado: ${plan.narrativeType} — viabilidade insuficiente (${Math.round(feasibility.score * 100)}%)`;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function logSelectionSummary(decisions: OutputDecision[]): void {
  const approved = decisions.filter(
    (d) => d.status === ApprovalStatus.APPROVED || d.status === ApprovalStatus.APPROVED_WITH_GAPS,
  );
  const rejected = decisions.filter((d) => d.status === ApprovalStatus.REJECTED);
  const deferred = decisions.filter((d) => d.status === ApprovalStatus.DEFERRED);

  logger.info(
    `[OutputSelection] Resultado: ${approved.length} aprovados, ` +
      `${deferred.length} adiados, ${rejected.length} rejeitados`,
  );

  for (const d of decisions) {
    const icon = d.status === ApprovalStatus.APPROVED ? '✓'
      : d.status === ApprovalStatus.APPROVED_WITH_GAPS ? '~'
      : d.status === ApprovalStatus.DEFERRED ? '⏸'
      : '✗';

    logger.info(
      `[OutputSelection]   ${icon} ${d.format} (${d.narrativeType}): ` +
        `${d.status}, p${d.priority}, conf=${d.confidence}, ` +
        `beats=${d.filledBeats}/${d.totalBeats}, ` +
        `assets=${d.availableAssetCount}/${d.requiredAssetCount}`,
    );

    if (d.gaps.length > 0) {
      for (const gap of d.gaps) {
        const flag = gap.blocking ? '[BLOCKING]' : '[gap]';
        logger.info(
          `[OutputSelection]     ${flag} ${gap.criterion}: ` +
            `requer ${gap.required}, disponível ${gap.actual}`,
        );
      }
    }
  }
}

// Re-exports
export { evaluateFeasibility, determineApprovalStatus } from './feasibility-evaluator.js';
export { prioritizeOutputs } from './output-prioritizer.js';
