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
