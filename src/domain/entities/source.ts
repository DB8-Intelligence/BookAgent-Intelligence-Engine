/**
 * Entity: Source
 *
 * Unidade semântica central do BookAgent.
 * Uma fonte combina texto + imagens + metadados extraídos do material original,
 * classificada por tipo (hero, lifestyle, planta, etc.).
 */

import type { Asset } from './asset.js';
import type { SourceType, ColorPalette } from '../value-objects/index.js';

export interface BrandingContext {
  colors: ColorPalette;
  style: string;
}

export interface Source {
  id: string;
  type: SourceType;
  title: string;
  description: string;
  images: Asset[];
  tags: string[];
  confidenceScore: number;
  sourcePage?: number;
  rawText?: string;
  brandingContext?: BrandingContext;
  priority: number;
  createdAt: Date;
}
