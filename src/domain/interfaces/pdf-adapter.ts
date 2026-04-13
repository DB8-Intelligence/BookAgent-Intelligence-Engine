/**
 * Interface: IPDFAdapter
 *
 * Contrato para adapters de processamento de PDF.
 * Separa a lógica de parsing do módulo de ingestão.
 */

import type { Dimensions } from '../value-objects/index.js';

export interface IPDFAdapter {
  /** Extrai texto bruto de todas as páginas */
  extractText(filePath: string): Promise<PDFTextResult>;

  /** Extrai imagens embutidas no PDF */
  extractImages(filePath: string): Promise<PDFImageResult[]>;

  /** Renderiza uma página como imagem PNG */
  renderPage(filePath: string, pageNumber: number, dpi?: number): Promise<Buffer>;

  /** Renderiza uma página como SVG vetorial (opcional — nem todo adapter suporta) */
  renderPageSvg?(filePath: string, pageNumber: number): Promise<Buffer>;

  /** Retorna o número total de páginas */
  getPageCount(filePath: string): Promise<number>;
}

export interface PDFTextResult {
  fullText: string;
  pages: PDFPageText[];
}

export interface PDFPageText {
  pageNumber: number;
  text: string;
}

export interface PDFImageResult {
  pageNumber: number;
  data: Buffer;
  format: string;
  dimensions: Dimensions;
}
