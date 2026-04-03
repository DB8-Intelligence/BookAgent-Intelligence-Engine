/**
 * Entity: Asset
 *
 * Representa um recurso visual extraído de um material (imagem, page render,
 * ícone, bloco de layout). Todo asset tem localização no storage,
 * dimensões e posição de origem no documento.
 */

import type { SourceType, Position, Dimensions, AssetOrigin } from '../value-objects/index.js';

export interface Asset {
  /** Identificador único do asset */
  id: string;

  /** Caminho do arquivo no storage */
  filePath: string;

  /** Caminho do thumbnail (preview 300x300) */
  thumbnailPath?: string;

  /** Largura e altura em pixels */
  dimensions: Dimensions;

  /** Página de origem no documento */
  page: number;

  /** Posição na página (quando disponível via PDF parsing) */
  position?: Position;

  /** Formato do arquivo (png, jpg, webp) */
  format: string;

  /** Tamanho em bytes */
  sizeBytes: number;

  /** Classificação semântica (hero, lifestyle, planta, etc.) */
  classification?: SourceType;

  /** Como o asset foi obtido */
  origin: AssetOrigin;

  /** Hash SHA-256 do conteúdo (para deduplicação) */
  hash?: string;

  /** IDs das fontes correlacionadas a este asset */
  correlationIds?: string[];
}
