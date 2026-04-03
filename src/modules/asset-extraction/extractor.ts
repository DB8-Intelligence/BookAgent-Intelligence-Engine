/**
 * Asset Extractor
 *
 * Extrai imagens embutidas de arquivos PDF.
 *
 * Estratégia:
 * 1. Parsear o PDF via IPDFAdapter
 * 2. Renderizar páginas como imagem (fallback)
 * 3. Extrair imagens embutidas quando possível
 * 4. Salvar via IStorageAdapter
 * 5. Gerar thumbnails para preview
 * 6. Retornar metadados de cada asset extraído
 *
 * Preparado para futura classificação com IA (hero, lifestyle, planta, etc.)
 */

import type { ExtractedAsset, ExtractionOptions, ExtractionResult } from './types.js';

export class AssetExtractor {
  private options: ExtractionOptions;

  constructor(options: ExtractionOptions) {
    this.options = options;
  }

  /**
   * Extrai todos os assets de um arquivo PDF.
   */
  async extractFromPDF(filePath: string): Promise<ExtractionResult> {
    const startTime = Date.now();

    // TODO: Implementar extração real via IPDFAdapter
    // Etapa 1: Ler o PDF
    // Etapa 2: Iterar páginas
    // Etapa 3: Extrair imagens embutidas (streams de imagem do PDF)
    // Etapa 4: Renderizar página completa como fallback
    // Etapa 5: Salvar cada imagem via IStorageAdapter
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
   * Placeholder para integração futura com IAIAdapter.
   */
  async classifyAsset(asset: ExtractedAsset): Promise<ExtractedAsset> {
    // TODO: Enviar imagem para IAIAdapter.analyzeImage()
    return asset;
  }
}
