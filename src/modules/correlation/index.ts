/**
 * Módulo: Correlation Engine
 *
 * Correlaciona textos, assets visuais, páginas e contexto narrativo
 * dentro do ProcessingContext, criando blocos semânticos reutilizáveis.
 *
 * Pipeline interno:
 * 1. Parsear textos das páginas em TextBlocks (headline, parágrafo, bullet, CTA)
 * 2. Correlacionar TextBlocks com Assets por proximidade de página
 * 3. Classificar cada bloco: SourceType, NarrativeRole, CommercialRole
 * 4. Atribuir prioridade e confiança
 * 5. Salvar CorrelationBlock[] no context
 *
 * Esses blocos alimentam diretamente o Source Intelligence e Narrative,
 * que os transformam em Sources tipadas e narrativas prontas para outputs.
 */

import { PipelineStage } from '../../domain/value-objects/index.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { logger } from '../../utils/logger.js';

import { parseTextBlocks } from './text-block-parser.js';
import { correlateByPage } from './page-correlator.js';
import { classifyAndEnrichBlocks } from './asset-classifier.js';

export class CorrelationModule implements IModule {
  readonly stage = PipelineStage.CORRELATION;
  readonly name = 'Correlation Engine';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const pageTexts = context.pageTexts ?? [];
    const assets = context.assets ?? [];

    logger.info(
      `[Correlation] Iniciando com ${pageTexts.length} páginas de texto e ${assets.length} assets`,
    );

    // --- Etapa 1: Parsear textos em blocos semânticos ---
    const textBlocks = parseTextBlocks(pageTexts);
    logger.info(`[Correlation] ${textBlocks.length} blocos de texto extraídos`);

    if (textBlocks.length === 0 && assets.length === 0) {
      logger.warn('[Correlation] Sem texto e sem assets — nenhuma correlação possível');
      return { ...context, correlations: [] };
    }

    // --- Etapa 2: Correlacionar por proximidade de página ---
    const rawBlocks = correlateByPage(textBlocks, assets);
    logger.info(`[Correlation] ${rawBlocks.length} blocos correlacionados por página`);

    // --- Etapa 3: Classificar e enriquecer com tipo, papel e prioridade ---
    const totalPages = pageTexts.length > 0
      ? Math.max(...pageTexts.map((p) => p.pageNumber))
      : assets.length > 0
        ? Math.max(...assets.map((a) => a.page))
        : 0;

    const enrichedBlocks = classifyAndEnrichBlocks(rawBlocks, assets, totalPages);

    // --- Etapa 4: Ordenar por prioridade ---
    enrichedBlocks.sort((a, b) => a.priority - b.priority);

    // --- Etapa 5: Atualizar assets com correlationIds ---
    const updatedAssets = linkAssetsToBlocks(context.assets ?? [], enrichedBlocks);

    // --- Log de resultados ---
    logCorrelationSummary(enrichedBlocks);

    return {
      ...context,
      correlations: enrichedBlocks,
      assets: updatedAssets,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Atualiza os correlationIds dos assets com base nos blocos correlacionados.
 */
function linkAssetsToBlocks(
  assets: import('../../domain/entities/asset.js').Asset[],
  blocks: import('../../domain/entities/correlation.js').CorrelationBlock[],
): import('../../domain/entities/asset.js').Asset[] {
  // Mapear: assetId → blockIds
  const assetBlockMap = new Map<string, string[]>();
  for (const block of blocks) {
    for (const assetId of block.assetIds) {
      const existing = assetBlockMap.get(assetId);
      if (existing) {
        existing.push(block.id);
      } else {
        assetBlockMap.set(assetId, [block.id]);
      }
    }
  }

  return assets.map((asset) => {
    const blockIds = assetBlockMap.get(asset.id);
    if (blockIds) {
      return { ...asset, correlationIds: blockIds };
    }
    return asset;
  });
}

function logCorrelationSummary(
  blocks: import('../../domain/entities/correlation.js').CorrelationBlock[],
): void {
  const typeCounts = new Map<string, number>();
  const roleCounts = new Map<string, number>();
  let withAssets = 0;
  let withText = 0;

  for (const block of blocks) {
    if (block.assetIds.length > 0) withAssets++;
    if (block.textBlocks.length > 0) withText++;
    if (block.inferredType) {
      typeCounts.set(block.inferredType, (typeCounts.get(block.inferredType) ?? 0) + 1);
    }
    if (block.inferredNarrativeRole) {
      roleCounts.set(block.inferredNarrativeRole, (roleCounts.get(block.inferredNarrativeRole) ?? 0) + 1);
    }
  }

  logger.info(
    `[Correlation] Resultado: ${blocks.length} blocos (${withAssets} com imagens, ${withText} com texto)`,
  );

  const typeStr = [...typeCounts.entries()].map(([k, v]) => `${k}:${v}`).join(', ');
  if (typeStr) logger.info(`[Correlation] Tipos: ${typeStr}`);

  const roleStr = [...roleCounts.entries()].map(([k, v]) => `${k}:${v}`).join(', ');
  if (roleStr) logger.info(`[Correlation] Papéis: ${roleStr}`);
}

// Re-exports for convenience
export { parseTextBlocks } from './text-block-parser.js';
export { correlateByPage } from './page-correlator.js';
export { classifyAndEnrichBlocks } from './asset-classifier.js';
