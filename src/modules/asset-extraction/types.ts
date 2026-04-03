/**
 * Tipos do módulo Asset Extraction
 */

import type { SourceType } from '../../types/index.js';

export interface ExtractedAsset {
  id: string;
  filePath: string;
  thumbnailPath?: string;
  page: number;
  position?: { x: number; y: number; width: number; height: number };
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
  classification?: SourceType;
}

export interface ExtractionResult {
  assets: ExtractedAsset[];
  totalPages: number;
  processingTimeMs: number;
}

export interface ExtractionOptions {
  outputDir: string;
  generateThumbnails?: boolean;
  minWidth?: number;
  minHeight?: number;
}
