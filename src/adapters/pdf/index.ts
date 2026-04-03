/**
 * Adapter: PDF Processing
 *
 * Implementação de IPDFAdapter usando pdf-parse para extração de texto
 * e análise do buffer PDF para extração de imagens embutidas.
 *
 * Estratégia de extração de imagens:
 * 1. Parsear o buffer do PDF procurando image streams
 * 2. Identificar marcadores JPEG (FFD8) e PNG (89504E47) no buffer
 * 3. Extrair cada imagem encontrada como Buffer separado
 * 4. Usar sharp para obter dimensões e converter formatos
 *
 * Esta é uma implementação v1 — funcional mas sem acesso ao
 * modelo de objetos do PDF. Versões futuras usarão pdfjs-dist
 * para extração mais precisa com posição na página.
 */

import pdfParse from 'pdf-parse';
import { readFile } from 'node:fs/promises';
import type { IPDFAdapter, PDFTextResult, PDFImageResult } from '../../domain/interfaces/pdf-adapter.js';

export class PDFParseAdapter implements IPDFAdapter {
  /**
   * Extrai texto de todas as páginas do PDF.
   * Usa pdf-parse que retorna texto por página via render callback.
   */
  async extractText(filePath: string): Promise<PDFTextResult> {
    const buffer = await readFile(filePath);
    const pages: Array<{ pageNumber: number; text: string }> = [];

    // pdf-parse com render customizado para capturar texto por página
    const result = await pdfParse(buffer, {
      pagerender: async (pageData: { pageIndex: number; getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) => {
        const textContent = await pageData.getTextContent();
        const text = textContent.items.map((item: { str: string }) => item.str).join(' ');
        pages.push({ pageNumber: pageData.pageIndex + 1, text });
        return text;
      },
    });

    return {
      fullText: result.text,
      pages,
    };
  }

  /**
   * Extrai imagens embutidas do PDF.
   *
   * Estratégia: varrer o buffer raw do PDF procurando marcadores
   * de início de JPEG (FF D8 FF) e PNG (89 50 4E 47).
   * Para cada imagem encontrada, extrai o bloco de bytes correspondente.
   *
   * Limitação: não obtém posição na página nem número exato da página.
   * O número da página é estimado pela posição relativa no buffer.
   */
  async extractImages(filePath: string): Promise<PDFImageResult[]> {
    const buffer = await readFile(filePath);
    const images: PDFImageResult[] = [];

    // Estimar número de páginas para atribuir página a cada imagem
    const totalPages = await this.getPageCount(filePath);

    // --- Extrair JPEGs ---
    const jpegStart = Buffer.from([0xFF, 0xD8, 0xFF]);
    const jpegEnd = Buffer.from([0xFF, 0xD9]);
    let searchFrom = 0;

    while (searchFrom < buffer.length) {
      const startIdx = buffer.indexOf(jpegStart, searchFrom);
      if (startIdx === -1) break;

      const endIdx = buffer.indexOf(jpegEnd, startIdx + 3);
      if (endIdx === -1) break;

      const imageBuffer = buffer.subarray(startIdx, endIdx + 2);

      // Ignorar imagens muito pequenas (< 2KB — provavelmente thumbnails ou artefatos)
      if (imageBuffer.length > 2048) {
        const estimatedPage = Math.max(1, Math.ceil((startIdx / buffer.length) * totalPages));

        images.push({
          pageNumber: estimatedPage,
          data: Buffer.from(imageBuffer),
          format: 'jpeg',
          dimensions: { width: 0, height: 0 }, // Será preenchido pelo sharp no extractor
        });
      }

      searchFrom = endIdx + 2;
    }

    // --- Extrair PNGs ---
    const pngStart = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
    const pngEnd = Buffer.from([0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);
    searchFrom = 0;

    while (searchFrom < buffer.length) {
      const startIdx = buffer.indexOf(pngStart, searchFrom);
      if (startIdx === -1) break;

      const endIdx = buffer.indexOf(pngEnd, startIdx + 4);
      if (endIdx === -1) break;

      const imageBuffer = buffer.subarray(startIdx, endIdx + 8);

      if (imageBuffer.length > 2048) {
        const estimatedPage = Math.max(1, Math.ceil((startIdx / buffer.length) * totalPages));

        images.push({
          pageNumber: estimatedPage,
          data: Buffer.from(imageBuffer),
          format: 'png',
          dimensions: { width: 0, height: 0 },
        });
      }

      searchFrom = endIdx + 8;
    }

    return images;
  }

  /**
   * Renderiza uma página como imagem.
   * Requer pdfjs-dist com canvas — não implementado na v1.
   * Retorna placeholder para evolução futura.
   */
  async renderPage(_filePath: string, _pageNumber: number, _dpi = 300): Promise<Buffer> {
    // TODO: Implementar com pdfjs-dist + node-canvas para page render
    throw new Error('Page render not yet implemented — requires pdfjs-dist + canvas');
  }

  /**
   * Retorna o número total de páginas do PDF.
   */
  async getPageCount(filePath: string): Promise<number> {
    const buffer = await readFile(filePath);
    const result = await pdfParse(buffer);
    return result.numpages;
  }
}
