/**
 * Asset Extraction Module
 *
 * Implementa IModule. Extrai imagens e assets visuais de materiais.
 */

import { PipelineStage } from '../../domain/value-objects/index.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { AssetExtractor } from './extractor.js';

const DEFAULT_OUTPUT_DIR = 'storage/assets';

export class AssetExtractionModule implements IModule {
  readonly stage = PipelineStage.EXTRACTION;
  readonly name = 'Asset Extraction';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const extractor = new AssetExtractor({
      outputDir: `${DEFAULT_OUTPUT_DIR}/${context.jobId}`,
      generateThumbnails: true,
      minWidth: 100,
      minHeight: 100,
    });

    // TODO: Determinar tipo de arquivo e chamar extractor adequado
    const result = await extractor.extractFromPDF(context.input.fileUrl);

    return {
      ...context,
      assets: result.assets.map((asset) => ({
        id: asset.id,
        filePath: asset.filePath,
        thumbnailPath: asset.thumbnailPath,
        dimensions: asset.dimensions,
        page: asset.page,
        position: asset.boundingBox?.position,
        format: asset.format,
        sizeBytes: asset.sizeBytes,
        classification: asset.classification,
      })),
    };
  }
}
