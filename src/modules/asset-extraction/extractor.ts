/**
 * Asset Extractor
 *
 * Extrai imagens embutidas de arquivos PDF.
 *
 * Estratégia:
 * 1. Parsear o PDF com pdf-parse para texto
 * 2. Renderizar páginas como imagem com pdf2pic/sharp (fallback)
 * 3. Extrair imagens embutidas quando possível
 * 4. Salvar em storage/assets/{jobId}/
 * 5. Gerar thumbnails para preview
 * 6. Retornar metadados de cada asset extraído
 *
 * Preparado para futura classificação com IA (hero, lifestyle, planta, etc.)
 */

import { v4 as uuidv4 } from 'uuid';
import type { ExtractedAsset, ExtractionOptions, ExtractionResult } from './types.js';

export class AssetExtractor {
  private options: ExtractionOptions;

  constructor(options: ExtractionOptions) {
    this.options = options;
  }

  /**
   * Extrai todos os assets de um arquivo PDF.
   *
   * @param filePath - Caminho do arquivo PDF no sistema de arquivos
   * @returns Lista de assets extraídos com metadados
   */
  async extractFromPDF(filePath: string): Promise<ExtractionResult> {
    const startTime = Date.now();

    // TODO: Implementar extração real
    // Etapa 1: Ler o PDF
    // Etapa 2: Iterar páginas
    // Etapa 3: Extrair imagens embutidas (streams de imagem do PDF)
    // Etapa 4: Renderizar página completa como fallback
    // Etapa 5: Salvar cada imagem em this.options.outputDir
    // Etapa 6: Gerar thumbnail se this.options.generateThumbnails
    // Etapa 7: Montar metadados

    const assets: ExtractedAsset[] = [];

    return {
      assets,
      totalPages: 0,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Classifica um asset extraído usando IA.
   * Placeholder para integração futura com LLM/Vision model.
   */
  async classifyAsset(_asset: ExtractedAsset): Promise<ExtractedAsset> {
    // TODO: Enviar imagem para modelo de visão (Gemini/OpenAI)
    // para classificar como hero, lifestyle, planta, etc.
    return _asset;
  }
}
