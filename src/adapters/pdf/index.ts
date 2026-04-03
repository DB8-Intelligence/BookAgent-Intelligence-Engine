/**
 * Adapter: PDF Processing
 *
 * Implementação de IPDFAdapter usando pdf-parse e sharp.
 * Suporta múltiplas estratégias com fallback.
 */

import type { IPDFAdapter, PDFTextResult, PDFImageResult } from '../../domain/interfaces/pdf-adapter.js';

export class PDFParseAdapter implements IPDFAdapter {
  async extractText(filePath: string): Promise<PDFTextResult> {
    // TODO: Implementar com pdf-parse
    throw new Error('PDF text extraction not implemented');
  }

  async extractImages(filePath: string): Promise<PDFImageResult[]> {
    // TODO: Implementar extração de imagens
    throw new Error('PDF image extraction not implemented');
  }

  async renderPage(filePath: string, pageNumber: number, dpi = 300): Promise<Buffer> {
    // TODO: Implementar renderização de página
    throw new Error('PDF page render not implemented');
  }

  async getPageCount(filePath: string): Promise<number> {
    // TODO: Implementar contagem de páginas
    throw new Error('PDF page count not implemented');
  }
}
