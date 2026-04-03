/**
 * Asset Extractor
 *
 * Extrai imagens embutidas de arquivos PDF usando IPDFAdapter.
 * Processa cada imagem com sharp para obter dimensões,
 * gerar thumbnails e salvar via IStorageAdapter.
 *
 * Fluxo:
 * 1. Chamar pdfAdapter.extractImages() para obter buffers de imagem
 * 2. Para cada imagem: obter metadados via sharp, salvar no storage
 * 3. Gerar thumbnail (300x300) para preview rápido
 * 4. Calcular hash SHA-256 para deduplicação
 * 5. Retornar lista de ExtractedAsset com metadados completos
 */

import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import type { IPDFAdapter } from '../../domain/interfaces/pdf-adapter.js';
import type { IStorageAdapter } from '../../domain/interfaces/storage-adapter.js';
import { AssetOrigin } from '../../domain/value-objects/index.js';
import type { ExtractedAsset, ExtractionOptions, ExtractionResult } from './types.js';

export class AssetExtractor {
  constructor(
    private options: ExtractionOptions,
    private pdfAdapter: IPDFAdapter,
    private storage: IStorageAdapter,
  ) {}

  /**
   * Extrai todos os assets de um arquivo PDF.
   *
   * @param filePath - Caminho do arquivo PDF no sistema de arquivos
   * @param jobId - ID do job para organizar os assets no storage
   * @returns Lista de assets extraídos com metadados completos
   */
  async extractFromPDF(filePath: string, jobId: string): Promise<ExtractionResult> {
    const startTime = Date.now();

    // Criar diretórios do job no storage
    await this.storage.createJobDir(jobId);

    // Extrair imagens raw do PDF via adapter
    const rawImages = await this.pdfAdapter.extractImages(filePath);
    const totalPages = await this.pdfAdapter.getPageCount(filePath);

    const assets: ExtractedAsset[] = [];
    let imageIndex = 0;

    for (const rawImage of rawImages) {
      try {
        // Obter metadados da imagem via sharp
        const metadata = await sharp(rawImage.data).metadata();
        const width = metadata.width ?? 0;
        const height = metadata.height ?? 0;

        // Filtrar imagens muito pequenas
        if (width < (this.options.minWidth ?? 100) || height < (this.options.minHeight ?? 100)) {
          continue;
        }

        imageIndex++;
        const id = uuidv4();
        const format = rawImage.format === 'png' ? 'png' : 'jpeg';
        const fileName = `raw/page${String(rawImage.pageNumber).padStart(2, '0')}_img${String(imageIndex).padStart(2, '0')}.${format}`;

        // Salvar imagem original no storage
        const fileSavePath = await this.storage.save(jobId, fileName, rawImage.data);

        // Calcular hash para deduplicação
        const hash = createHash('sha256').update(rawImage.data).digest('hex');

        // Gerar thumbnail se configurado
        let thumbnailPath: string | undefined;
        if (this.options.generateThumbnails) {
          const thumbBuffer = await sharp(rawImage.data)
            .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();

          const thumbFileName = `thumbnails/page${String(rawImage.pageNumber).padStart(2, '0')}_img${String(imageIndex).padStart(2, '0')}_thumb.jpg`;
          thumbnailPath = await this.storage.save(jobId, thumbFileName, thumbBuffer);
        }

        assets.push({
          id,
          filePath: fileSavePath,
          thumbnailPath,
          page: rawImage.pageNumber,
          dimensions: { width, height },
          format,
          sizeBytes: rawImage.data.length,
          origin: AssetOrigin.PDF_EXTRACTED,
          hash,
        });
      } catch {
        // Imagem corrompida ou formato não suportado — ignorar e continuar
        continue;
      }
    }

    return {
      assets,
      totalPages,
      processingTimeMs: Date.now() - startTime,
    };
  }
}
