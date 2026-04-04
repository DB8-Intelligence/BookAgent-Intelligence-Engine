/**
 * Book Compatibility Analysis Module
 *
 * Módulo de pipeline que analisa a estrutura do PDF antes da extração.
 * Determina a melhor estratégia para extrair assets com qualidade máxima.
 *
 * Stage: BOOK_ANALYSIS (entre INGESTION e EXTRACTION)
 *
 * Fluxo:
 * 1. Recebe contexto com localFilePath e pageTexts (do Ingestion)
 * 2. Inspeciona o PDF: imagens embutidas, texto vetorial, rasterização
 * 3. Classifica estrutura: embedded-assets, illustrator-like, rasterized, hybrid
 * 4. Recomenda estratégia: embedded-extraction, page-render, hybrid, manual-review
 * 5. Salva BookCompatibilityProfile no contexto
 *
 * A estratégia recomendada é consumida pelo AssetExtraction para adaptar
 * sua abordagem por arquivo.
 */

import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { PipelineStage } from '../../domain/value-objects/index.js';
import { inspectPDF } from './pdf-inspector.js';
import { recommendStrategy } from './strategy-recommender.js';
import type { BookCompatibilityProfile } from '../../domain/entities/book-compatibility.js';

// Re-exports
export { inspectPDF } from './pdf-inspector.js';
export { recommendStrategy } from './strategy-recommender.js';

export class BookCompatibilityAnalysisModule implements IModule {
  readonly stage = PipelineStage.BOOK_ANALYSIS;
  readonly name = 'BookCompatibilityAnalysis';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const filePath = context.localFilePath;
    const pageTexts = context.pageTexts ?? [];
    const pageCount = pageTexts.length;

    if (!filePath) {
      console.log(
        `[INFO] ${new Date().toISOString()} [${this.name}] Skipping — no local file path available`,
      );
      return context;
    }

    const startTime = Date.now();

    // 1. Inspect PDF structure
    console.log(
      `[INFO] ${new Date().toISOString()} [${this.name}] Analyzing PDF: ${filePath} (${pageCount} pages)`,
    );

    const signals = await inspectPDF(filePath, pageTexts, pageCount);

    // 2. Recommend strategy
    const recommendation = recommendStrategy(signals);
    const analysisTimeMs = Date.now() - startTime;

    const profile: BookCompatibilityProfile = {
      ...recommendation,
      analysisTimeMs,
    };

    // 3. Log results
    console.log(
      `[INFO] ${new Date().toISOString()} [${this.name}] Structure: ${profile.structureType}`,
    );
    console.log(
      `[INFO] ${new Date().toISOString()} [${this.name}] Strategy: ${profile.recommendedStrategy} (confidence: ${profile.confidence})`,
    );
    console.log(
      `[INFO] ${new Date().toISOString()} [${this.name}] Signals: ` +
      `images=${signals.embeddedImageCount}, ` +
      `vectorText=${signals.hasVectorText}, ` +
      `rasterized=${Math.round(signals.rasterizedPageRatio * 100)}%, ` +
      `creator=${signals.creatorTool ?? 'unknown'}, ` +
      `layers=${signals.hasLayerIndicators}`,
    );
    console.log(
      `[INFO] ${new Date().toISOString()} [${this.name}] Rationale: ${profile.rationale}`,
    );

    if (profile.warnings.length > 0) {
      for (const warning of profile.warnings) {
        console.log(
          `[WARN] ${new Date().toISOString()} [${this.name}] ${warning}`,
        );
      }
    }

    return {
      ...context,
      bookCompatibility: profile,
    };
  }
}
