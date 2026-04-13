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
import { PopplerPDFAdapter } from '../../adapters/pdf/poppler.js';
import { LocalStorageAdapter } from '../../adapters/storage/index.js';
import { SupabaseStorageUploader } from '../../adapters/storage/supabase.js';
import { logger } from '../../utils/logger.js';
import type { ExtractionOptions } from './types.js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://xhfiyukhjzwhqbacuyxq.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAGE_ASSETS_BUCKET = process.env.BOOK_ASSETS_BUCKET ?? 'book-assets';

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

    const pdfAdapter = new PopplerPDFAdapter();
    const storage = new LocalStorageAdapter();

    const pageUploader = SUPABASE_SERVICE_ROLE_KEY
      ? new SupabaseStorageUploader({
          supabaseUrl: SUPABASE_URL,
          serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
          bucket: PAGE_ASSETS_BUCKET,
        })
      : undefined;

    if (!pageUploader) {
      logger.warn(
        'Asset Extraction: SUPABASE_SERVICE_ROLE_KEY ausente — pageFormats não serão enviados ao Storage',
      );
    }

    const options: ExtractionOptions = {
      outputDir: `storage/assets/${context.jobId}`,
      generateThumbnails: true,
      minWidth: 100,
      minHeight: 100,
      strategy: strategy as ExtractionOptions['strategy'],
      renderDpi: 200,
    };

    const extractor = new AssetExtractor(options, pdfAdapter, storage, pageUploader);
    const result = await extractor.extractFromPDF(filePath, context.jobId);

    logger.info(
      `Asset Extraction: ${result.assets.length} assets extraídos de ${result.totalPages} páginas em ${result.processingTimeMs}ms (strategy=${strategy}); pageFormats=${result.pageFormats?.png_pages.length ?? 0} PNG / ${result.pageFormats?.svg_pages.length ?? 0} SVG`,
    );

    return {
      ...context,
      pageFormats: result.pageFormats,
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
