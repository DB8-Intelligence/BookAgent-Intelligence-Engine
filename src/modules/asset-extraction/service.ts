/**
 * Asset Extraction Module
 *
 * Implementa IModule. Extrai imagens e assets visuais de PDFs,
 * processa-os com sharp e persiste no storage.
 *
 * Este módulo é a primeira etapa visual do pipeline:
 * sem assets extraídos, nenhum output visual pode ser gerado.
 *
 * Fluxo:
 * 1. Verifica se o input é PDF (único tipo suportado na v1)
 * 2. Instancia o AssetExtractor com adapters reais
 * 3. Extrai imagens do PDF
 * 4. Popula context.assets com os resultados
 */

import { PipelineStage, InputType } from '../../domain/value-objects/index.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { AssetExtractor } from './extractor.js';
import { PDFParseAdapter } from '../../adapters/pdf/index.js';
import { LocalStorageAdapter } from '../../adapters/storage/index.js';
import { logger } from '../../utils/logger.js';

export class AssetExtractionModule implements IModule {
  readonly stage = PipelineStage.EXTRACTION;
  readonly name = 'Asset Extraction';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    // v1: somente PDF suportado
    if (context.input.type !== InputType.PDF) {
      logger.warn(`Asset Extraction: tipo "${context.input.type}" não suportado na v1, pulando`);
      return { ...context, assets: [] };
    }

    // Verificar se o arquivo local existe (populado pelo Ingestion)
    const filePath = context.localFilePath;
    if (!filePath) {
      logger.warn('Asset Extraction: localFilePath não disponível no context, pulando');
      return { ...context, assets: [] };
    }

    const pdfAdapter = new PDFParseAdapter();
    const storage = new LocalStorageAdapter();

    const extractor = new AssetExtractor(
      {
        outputDir: `storage/assets/${context.jobId}`,
        generateThumbnails: true,
        minWidth: 100,
        minHeight: 100,
      },
      pdfAdapter,
      storage,
    );

    const result = await extractor.extractFromPDF(filePath, context.jobId);

    logger.info(
      `Asset Extraction: ${result.assets.length} assets extraídos de ${result.totalPages} páginas em ${result.processingTimeMs}ms`,
    );

    return {
      ...context,
      assets: result.assets.map((asset) => ({
        id: asset.id,
        filePath: asset.filePath,
        thumbnailPath: asset.thumbnailPath,
        dimensions: asset.dimensions,
        page: asset.page,
        format: asset.format,
        sizeBytes: asset.sizeBytes,
        origin: asset.origin,
        hash: asset.hash,
      })),
    };
  }
}
