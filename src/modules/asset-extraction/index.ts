/**
 * Módulo: Asset Extraction
 *
 * Extrai imagens e assets visuais de materiais brutos (PDF, PPTX).
 * Salva em storage e retorna metadados para correlação.
 */

export { AssetExtractor } from './extractor.js';
export { AssetExtractionModule } from './service.js';
export type { ExtractedAsset, ExtractionResult, ExtractionOptions } from './types.js';
