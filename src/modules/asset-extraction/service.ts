/**
 * Asset Extraction Module
 *
 * Implementa IModule. Extrai imagens e assets visuais de PDFs,
 * processa-os com sharp e persiste no storage.
 *
 * IMPORTANTE: Este módulo agora é strategy-aware.
 * Ele lê context.bookCompatibility (do Book Compatibility Analysis)
 * para decidir a melhor estratégia de extração:
 *
 * - embedded-extraction → extrai imagens embutidas (padrão)
 * - page-render → renderiza cada página como imagem
 * - hybrid → combina embedded + render
 * - manual-review → fallback para embedded com warning
 *
 * Fluxo:
 * 1. Verifica se o input é PDF (único tipo suportado na v1)
 * 2. Lê a estratégia recomendada do bookCompatibility (se disponível)
 * 3. Instancia o AssetExtractor com a estratégia apropriada
 * 4. Extrai assets preservando qualidade original (IMUTÁVEIS)
 * 5. Popula context.assets com os resultados
 */

import { PipelineStage, InputType } from '../../domain/value-objects/index.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { AssetExtractor } from './extractor.js';
import { PDFParseAdapter } from '../../adapters/pdf/index.js';
import { LocalStorageAdapter } from '../../adapters/storage/index.js';
import { logger } from '../../utils/logger.js';
import type { ExtractionOptions } from './types.js';

export class AssetExtractionModule implements IModule {
  readonly stage = PipelineStage.EXTRACTION;
  readonly name = 'Asset Extraction';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    // v1: somente PDF suportado
    if (context.input.type !== InputType.PDF) {
      logger.warn(`Asset Extraction: tipo "${context.input.type}" não suportado na v1, pulando`);
      return { ...context, assets: [] };
    }

    const filePath = context.localFilePath;
    if (!filePath) {
      logger.warn('Asset Extraction: localFilePath não disponível no context, pulando');
      return { ...context, assets: [] };
    }

    // Ler estratégia do Book Compatibility Analysis (se executou antes)
    const compatibility = context.bookCompatibility;
    const strategy = compatibility?.recommendedStrategy ?? 'embedded-extraction';
    const confidence = compatibility?.confidence ?? 'unknown';

    logger.info(
      `Asset Extraction: strategy="${strategy}" (confidence=${confidence})`,
    );

    if (strategy === 'manual-review') {
      logger.warn(
        'Asset Extraction: strategy=manual-review — usando embedded como fallback. ' +
        'Revisar assets manualmente para garantir qualidade.',
      );
    }

    const pdfAdapter = new PDFParseAdapter();
    const storage = new LocalStorageAdapter();

    const options: ExtractionOptions = {
      outputDir: `storage/assets/${context.jobId}`,
      generateThumbnails: true,
      minWidth: 100,
      minHeight: 100,
      strategy: strategy as ExtractionOptions['strategy'],
      renderDpi: 200,
    };

    const extractor = new AssetExtractor(options, pdfAdapter, storage);
    const result = await extractor.extractFromPDF(filePath, context.jobId);

    logger.info(
      `Asset Extraction: ${result.assets.length} assets extraídos de ${result.totalPages} páginas em ${result.processingTimeMs}ms (strategy=${strategy})`,
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
        isOriginal: true as const,
      })),
    };
  }
}
