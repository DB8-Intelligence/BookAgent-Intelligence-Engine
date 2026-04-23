/**
 * Entity: Asset
 *
 * Representa um recurso visual extraído de um material (imagem, page render,
 * ícone, bloco de layout). Todo asset tem localização no storage,
 * dimensões e posição de origem no documento.
 *
 * REGRA DE IMUTABILIDADE:
 * Assets são referências imutáveis ao material original do empreendimento.
 * A IA pode extrair, classificar, correlacionar, referenciar e prototipar,
 * mas NUNCA pode alterar, retocar, reconstruir ou substituir o conteúdo original.
 * Composições visuais (overlays, textos, branding) devem usar camada separada.
 *
 * @see ASSET_PRESERVATION_POLICY em book-compatibility.ts
 */

import type { SourceType, Position, Dimensions, AssetOrigin } from '../value-objects/index.js';
import type { PDFGeometry, PDFImageMetadata } from '../interfaces/geometry.js';

export interface Asset {
  /** Identificador único do asset */
  readonly id: string;

  /** Caminho do arquivo no storage (IMUTÁVEL — nunca sobrescrever) */
  readonly filePath: string;

  /** Caminho do thumbnail (preview 300x300) */
  readonly thumbnailPath?: string;

  /** Largura e altura em pixels */
  readonly dimensions: Dimensions;

  /** Página de origem no documento */
  readonly page: number;

  /** Posição na página (quando disponível via PDF parsing) */
  readonly position?: Position;

  /** Formato do arquivo (png, jpg, webp) */
  readonly format: string;

  /** Tamanho em bytes */
  readonly sizeBytes: number;

  /** Classificação semântica (hero, lifestyle, planta, etc.) */
  classification?: SourceType;

  /** Como o asset foi obtido */
  readonly origin: AssetOrigin;

  /** Hash SHA-256 do conteúdo (para deduplicação) */
  readonly hash?: string;

  /** IDs das fontes correlacionadas a este asset */
  correlationIds?: string[];

  /**
   * Flag de imutabilidade — indica que este é um asset original do book.
   * Sempre true para assets extraídos. Impede que qualquer módulo
   * modifique o conteúdo do arquivo referenciado por filePath.
   */
  readonly isOriginal: true;

  /**
   * Geometria estruturada vinda da extração enhanced (pdfjs-dist).
   * Opcional — assets extraídos apenas via poppler não têm este campo.
   * Consumidores do pipeline visual devem tratar ausência como
   * "geometria desconhecida" e degradar graciosamente.
   */
  readonly geometry?: PDFGeometry;

  /**
   * Metadados de cor e alpha do asset. Complementa `geometry` e idem:
   * opcional, populado apenas no fluxo enhanced.
   */
  readonly imageMetadata?: PDFImageMetadata;

  /**
   * Análise multimodal via Gemini (VisualParser). Opt-in via
   * VISUAL_PARSER_ENABLED=true. Contém categoria, crop 9:16 sugerido
   * e relevance para Reels. Consumido pelo SceneComposer para ordenar
   * assets e aplicar crops inteligentes.
   */
  readonly visualAnalysis?: {
    description: string;
    category: string;
    qualityScore: number;
    relevanceForReel: number;
    cropSuggestion: {
      aspectRatio: string;
      x: number; y: number; width: number; height: number;
      reason: string;
    };
    hasText: boolean;
    model: string;
  };
}
