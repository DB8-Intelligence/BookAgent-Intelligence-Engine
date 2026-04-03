/**
 * Asset Extraction Service
 *
 * Serviço de alto nível que coordena a extração de assets.
 * É o ponto de entrada do módulo para o pipeline.
 */

import type { PipelineContext } from '../../types/index.js';
import { AssetExtractor } from './extractor.js';

const DEFAULT_OUTPUT_DIR = 'storage/assets';

export async function handleAssetExtraction(context: PipelineContext): Promise<PipelineContext> {
  const extractor = new AssetExtractor({
    outputDir: `${DEFAULT_OUTPUT_DIR}/${context.jobId}`,
    generateThumbnails: true,
    minWidth: 100,
    minHeight: 100,
  });

  // TODO: Determinar tipo de arquivo e chamar extractor adequado
  // Por enquanto, assume PDF
  const result = await extractor.extractFromPDF(context.input.fileUrl);

  return {
    ...context,
    assets: result.assets.map((asset) => ({
      id: asset.id,
      filePath: asset.filePath,
      thumbnailPath: asset.thumbnailPath,
      width: asset.width,
      height: asset.height,
      page: asset.page,
      position: asset.position ? { x: asset.position.x, y: asset.position.y } : undefined,
      classification: asset.classification,
    })),
  };
}
