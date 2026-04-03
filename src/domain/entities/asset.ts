/**
 * Entity: Asset
 *
 * Representa um recurso visual extraído de um material (imagem, page render,
 * ícone, bloco de layout). Todo asset tem localização no storage,
 * dimensões e posição de origem no documento.
 */

import type { SourceType, Position, Dimensions } from '../value-objects/index.js';

export interface Asset {
  id: string;
  filePath: string;
  thumbnailPath?: string;
  dimensions: Dimensions;
  page: number;
  position?: Position;
  format: string;
  sizeBytes: number;
  classification?: SourceType;
}
