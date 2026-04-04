/**
 * Book Reverse Engineering Module
 *
 * Módulo de pipeline que analisa a estrutura editorial do book e gera
 * um protótipo estrutural abstrato (BookPrototype).
 *
 * Stage: REVERSE_ENGINEERING (entre BOOK_ANALYSIS e EXTRACTION)
 *
 * Fluxo:
 * 1. Recebe contexto com pageTexts (do Ingestion) e assets (se disponíveis)
 * 2. Classifica cada página em um PageArchetypeType
 * 3. Detecta ContentZones e CompositionPatterns
 * 4. Identifica LayoutPatterns recorrentes
 * 5. Analisa DesignHierarchy do book
 * 6. Salva BookPrototype no contexto
 *
 * IMPORTANTE: Este módulo é puramente analítico.
 * NÃO modifica, altera ou reconstrói nenhum asset original.
 * Apenas classifica, estrutura e prototipar o design editorial.
 */

import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { PipelineStage } from '../../domain/value-objects/index.js';
import { classifyAllPages } from './page-classifier.js';
import { buildBookPrototype } from './layout-analyzer.js';

// Re-exports
export { classifyPage, classifyAllPages } from './page-classifier.js';
export {
  detectLayoutPatterns,
  analyzeDesignHierarchy,
  calculateConsistencyScore,
  buildBookPrototype,
} from './layout-analyzer.js';

export class BookReverseEngineeringModule implements IModule {
  readonly stage = PipelineStage.REVERSE_ENGINEERING;
  readonly name = 'BookReverseEngineering';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const pageTexts = context.pageTexts ?? [];
    const assets = context.assets ?? [];

    if (pageTexts.length === 0) {
      console.log(
        `[INFO] ${new Date().toISOString()} [${this.name}] Skipping — no page texts available`,
      );
      return context;
    }

    const startTime = Date.now();

    // 1. Classify all pages
    console.log(
      `[INFO] ${new Date().toISOString()} [${this.name}] Analyzing ${pageTexts.length} pages...`,
    );

    const archetypes = classifyAllPages(pageTexts, assets);

    // 2. Build full prototype
    const analysisTimeMs = Date.now() - startTime;
    const prototype = buildBookPrototype(archetypes, analysisTimeMs);

    // 3. Log results
    console.log(
      `[INFO] ${new Date().toISOString()} [${this.name}] Pages classified: ${prototype.pageCount}`,
    );
    console.log(
      `[INFO] ${new Date().toISOString()} [${this.name}] Layout patterns found: ${prototype.layoutPatterns.length}`,
    );
    console.log(
      `[INFO] ${new Date().toISOString()} [${this.name}] Design mode: ${prototype.designHierarchy.dominantMode}`,
    );
    console.log(
      `[INFO] ${new Date().toISOString()} [${this.name}] Consistency score: ${prototype.consistencyScore.toFixed(2)}`,
    );
    console.log(
      `[INFO] ${new Date().toISOString()} [${this.name}] Archetype distribution: ${JSON.stringify(prototype.archetypeDistribution)}`,
    );
    console.log(
      `[INFO] ${new Date().toISOString()} [${this.name}] Narrative flow: ${prototype.designHierarchy.hasNarrativeFlow ? 'detected' : 'not detected'}`,
    );

    if (prototype.layoutPatterns.length > 0) {
      const top = prototype.layoutPatterns[0];
      console.log(
        `[INFO] ${new Date().toISOString()} [${this.name}] Dominant pattern: "${top.name}" (${top.frequency} pages)`,
      );
    }

    return {
      ...context,
      bookPrototype: prototype,
    };
  }
}
