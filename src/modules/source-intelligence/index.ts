/**
 * Módulo: Source Intelligence Engine
 *
 * Transforma CorrelationBlock[] em Source[] — a entidade central
 * do BookAgent, consumida por todos os módulos de geração.
 *
 * Pipeline interno:
 * 1. Build: converter cada CorrelationBlock em Source com tipo,
 *    título, texto, resumo, roles e branding context
 * 2. Merge: detectar e mesclar fontes redundantes (mesmo tipo,
 *    páginas próximas, keywords similares)
 * 3. Rank: calcular score de qualidade e reordenar por prioridade
 * 4. Validate: garantir cobertura mínima de tipos estratégicos
 *
 * Resultado: Source[] ordenadas por prioridade, prontas para
 * alimentar narrative, output-selection, media, blog, landing-page.
 */

import { PipelineStage, SourceType } from '../../domain/value-objects/index.js';
import type { Source } from '../../domain/entities/source.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { logger } from '../../utils/logger.js';

import { buildSources } from './source-builder.js';
import { mergeSimilarSources } from './source-merger.js';
import { rankSources } from './source-ranker.js';

export class SourceIntelligenceModule implements IModule {
  readonly stage = PipelineStage.SOURCE_INTELLIGENCE;
  readonly name = 'Source Intelligence';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const correlations = context.correlations ?? [];

    logger.info(
      `[SourceIntelligence] Iniciando com ${correlations.length} blocos correlacionados`,
    );

    if (correlations.length === 0) {
      logger.warn('[SourceIntelligence] Sem correlações — nenhuma fonte gerada');
      return { ...context, sources: [] };
    }

    // --- Etapa 1: Build — converter CorrelationBlock[] → Source[] ---
    const rawSources = buildSources(correlations, context.branding);
    logger.info(`[SourceIntelligence] ${rawSources.length} fontes construídas`);

    // --- Etapa 2: Merge — mesclar fontes redundantes ---
    const mergedSources = mergeSimilarSources(rawSources);
    const mergeCount = rawSources.length - mergedSources.length;
    if (mergeCount > 0) {
      logger.info(`[SourceIntelligence] ${mergeCount} fontes mescladas (${mergedSources.length} restantes)`);
    }

    // --- Etapa 3: Rank — calcular score e reordenar ---
    const rankedSources = rankSources(mergedSources);

    // --- Etapa 4: Validate — verificar cobertura ---
    validateCoverage(rankedSources);

    // --- Log de resultados ---
    logSourceSummary(rankedSources);

    return {
      ...context,
      sources: rankedSources,
    };
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Tipos estratégicos que idealmente devem existir */
const STRATEGIC_TYPES = new Set([
  SourceType.HERO,
  SourceType.LIFESTYLE,
  SourceType.DIFERENCIAL,
  SourceType.CTA,
]);

/**
 * Verifica se os tipos estratégicos estão representados nas sources.
 * Não bloqueia — apenas loga warnings para tipos ausentes.
 */
function validateCoverage(sources: Source[]): void {
  const presentTypes = new Set(sources.map((s) => s.type));

  for (const strategicType of STRATEGIC_TYPES) {
    if (!presentTypes.has(strategicType)) {
      logger.warn(
        `[SourceIntelligence] Tipo estratégico ausente: ${strategicType}. ` +
          'Material pode não ter conteúdo suficiente deste tipo.',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function logSourceSummary(sources: Source[]): void {
  const typeCounts = new Map<string, number>();
  let withAssets = 0;
  let withText = 0;
  let avgConfidence = 0;

  for (const source of sources) {
    typeCounts.set(source.type, (typeCounts.get(source.type) ?? 0) + 1);
    if (source.assetIds.length > 0) withAssets++;
    if (source.text.length > 10) withText++;
    avgConfidence += source.confidenceScore;
  }

  if (sources.length > 0) {
    avgConfidence = Math.round((avgConfidence / sources.length) * 100) / 100;
  }

  logger.info(
    `[SourceIntelligence] Resultado: ${sources.length} fontes ` +
      `(${withAssets} com imagens, ${withText} com texto, confiança média: ${avgConfidence})`,
  );

  const typeStr = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(', ');

  if (typeStr) {
    logger.info(`[SourceIntelligence] Distribuição: ${typeStr}`);
  }

  // Top 3 fontes por prioridade
  const top3 = sources.slice(0, 3);
  if (top3.length > 0) {
    logger.info(
      `[SourceIntelligence] Top 3: ${top3.map((s) => `[${s.type}] "${s.title}" (p${s.priority})`).join(' | ')}`,
    );
  }
}

// Re-exports
export { buildSources } from './source-builder.js';
export { mergeSimilarSources } from './source-merger.js';
export { rankSources } from './source-ranker.js';
