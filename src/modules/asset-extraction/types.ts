/**
 * Tipos do módulo Asset Extraction
 */

import type { SourceType, Dimensions, BoundingBox, AssetOrigin } from '../../domain/value-objects/index.js';

export interface ExtractedAsset {
  id: string;
  filePath: string;
  thumbnailPath?: string;
  page: number;
  boundingBox?: BoundingBox;
  dimensions: Dimensions;
  format: string;
  sizeBytes: number;
  classification?: SourceType;
  origin: AssetOrigin;
  hash?: string;
}

export interface PageFormats {
  /** URLs públicas (CDN) dos PNGs 300dpi por página, indexadas por ordem de página */
  png_pages: string[];
  /** URLs públicas (CDN) dos SVGs vetoriais por página, indexadas por ordem de página */
  svg_pages: string[];
}

export interface ExtractionResult {
  assets: ExtractedAsset[];
  totalPages: number;
  processingTimeMs: number;
  /** Renderizações por página (PNG 300dpi + SVG). Populado quando upload está habilitado. */
  pageFormats?: PageFormats;
}

export interface ExtractionOptions {
  outputDir: string;
  generateThumbnails?: boolean;
  minWidth?: number;
  minHeight?: number;
  /** Estratégia de extração decidida pelo BookCompatibilityAnalysis */
  strategy?: 'embedded-extraction' | 'page-render' | 'hybrid' | 'manual-review';
  /** DPI para renderização de página (usado em page-render e hybrid) */
  renderDpi?: number;
}
