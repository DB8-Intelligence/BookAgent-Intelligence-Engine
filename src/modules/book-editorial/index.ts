/**
 * Book Editorial — barrel exports
 *
 * Ponto de entrada do bounded context editorial. Constrói um registry com
 * os 7 handlers editoriais implementados (intake → editorial_qa).
 *
 * Cada handler é registrado explicitamente (não reflexivo) para manter o
 * grafo de módulos inspecionável e evitar handlers "fantasma".
 */

import { BookEditorialHandlerRegistry } from './registry.js';
import { IntakeStepHandler } from './intake/index.js';
import { MarketAnalysisStepHandler } from './market-analysis/index.js';
import { ThemeValidationStepHandler } from './theme-validation/index.js';
import { BookDnaStepHandler } from './book-dna/index.js';
import { OutlineStepHandler } from './outline/index.js';
import { ChapterWritingStepHandler } from './chapter-writing/index.js';
import { EditorialQaStepHandler } from './editorial-qa/index.js';

export { BookEditorialHandlerRegistry } from './registry.js';
export { IntakeStepHandler } from './intake/index.js';
export { MarketAnalysisStepHandler } from './market-analysis/index.js';
export { ThemeValidationStepHandler } from './theme-validation/index.js';
export { BookDnaStepHandler } from './book-dna/index.js';
export { OutlineStepHandler } from './outline/index.js';
export { ChapterWritingStepHandler } from './chapter-writing/index.js';
export { EditorialQaStepHandler } from './editorial-qa/index.js';

// Re-exporta os shapes de content que outros módulos/serviços consomem
export type { BookDnaContent } from './book-dna/index.js';
export type { OutlineContent, OutlineChapter } from './outline/index.js';
export type { ChapterDraftContent } from './chapter-writing/index.js';
export type {
  QaReportContent,
  ChapterQaResult,
  ChapterQaStatus,
  ChapterQaFinding,
} from './editorial-qa/index.js';

/**
 * Cria um registry populado com todos os handlers implementados.
 */
export function createBookEditorialRegistry(): BookEditorialHandlerRegistry {
  const registry = new BookEditorialHandlerRegistry();
  registry.register(new IntakeStepHandler());
  registry.register(new MarketAnalysisStepHandler());
  registry.register(new ThemeValidationStepHandler());
  registry.register(new BookDnaStepHandler());
  registry.register(new OutlineStepHandler());
  registry.register(new ChapterWritingStepHandler());
  registry.register(new EditorialQaStepHandler());
  return registry;
}
