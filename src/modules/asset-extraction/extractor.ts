/**
 * Asset Extractor
 *
 * Extrai imagens de arquivos PDF usando IPDFAdapter.
 * A estratégia de extração é configurável via ExtractionOptions.strategy,
 * decidida pelo BookCompatibilityAnalysis:
 *
 * - embedded-extraction: extrai imagens embutidas diretamente (padrão)
 * - page-render: renderiza cada página como imagem de alta resolução
 * - hybrid: extrai embutidos + renderiza páginas sem assets
 * - manual-review: fallback para embedded com warning
 *
 * Processamento de cada asset:
 * 1. Obter metadados via sharp (dimensões)
 * 2. Salvar no storage via IStorageAdapter
 * 3. Gerar thumbnail (300x300) para preview rápido
 * 4. Calcular hash SHA-256 para deduplicação
 *
 * REGRA: Assets extraídos são IMUTÁVEIS — nunca modificar o conteúdo original.
 */

import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import type { IPDFAdapter } from '../../domain/interfaces/pdf-adapter.js';
import type { IStorageAdapter } from '../../domain/interfaces/storage-adapter.js';
import { AssetOrigin } from '../../domain/value-objects/index.js';
import type { SupabaseStorageUploader } from '../../adapters/storage/supabase.js';
import { PDFJSEnhancedAdapter } from '../../adapters/pdf/pdfjs-enhanced.js';
import { ColorSpaceManager } from '../../adapters/pdf/color-manager.js';
import { logger } from '../../utils/logger.js';
import type {
  ExtractedAsset,
  ExtractionOptions,
  ExtractionResult,
  PageFormats,
} from './types.js';

export class AssetExtractor {
  /**
   * Adapter opcional de geometria (pdfjs-dist). Se ausente, `enhanced-extraction`
   * cai para `embedded-extraction`. Mantemos opcional para preservar
   * retrocompatibilidade com consumidores que não injetam.
   */
  private readonly pdfjsEnhanced: PDFJSEnhancedAdapter | null;
  private readonly colorManager: ColorSpaceManager | null;

  constructor(
    private options: ExtractionOptions,
    private pdfAdapter: IPDFAdapter,
    private storage: IStorageAdapter,
    private pageUploader?: SupabaseStorageUploader,
    pdfjsEnhanced?: PDFJSEnhancedAdapter,
    colorManager?: ColorSpaceManager,
  ) {
    this.pdfjsEnhanced = pdfjsEnhanced ?? null;
    this.colorManager = colorManager ?? null;
  }

  /**
   * Extrai todos os assets de um arquivo PDF.
   * A estratégia usada é decidida por `options.strategy`.
   */
  async extractFromPDF(filePath: string, jobId: string): Promise<ExtractionResult> {
    const startTime = Date.now();
    const strategy = this.options.strategy ?? 'embedded-extraction';

    await this.storage.createJobDir(jobId);

    const totalPages = await this.pdfAdapter.getPageCount(filePath);

    const assetsPromise: Promise<ExtractedAsset[]> = (() => {
      switch (strategy) {
        case 'enhanced-extraction':
          return this.extractEnhanced(filePath, jobId);
        case 'page-render':
          return this.extractViaPageRender(filePath, jobId, totalPages);
        case 'hybrid':
          return this.extractHybrid(filePath, jobId, totalPages);
        case 'manual-review':
        case 'embedded-extraction':
        default:
          return this.extractEmbedded(filePath, jobId);
      }
    })();

    // Page-format rendering (PNG 300dpi + SVG) roda em paralelo — sempre,
    // independente da estratégia de extração de assets embarcados.
    const pageFormatsPromise = this.extractPageFormats(filePath, jobId, totalPages);

    const [rawAssets, pageFormats] = await Promise.all([assetsPromise, pageFormatsPromise]);

    // Upload individual photos to Supabase Storage (parallel with page formats already done)
    const assets = await this.uploadIndividualAssets(rawAssets, jobId);

    return {
      assets,
      totalPages,
      processingTimeMs: Date.now() - startTime,
      pageFormats,
    };
  }

  // ---------------------------------------------------------------------------
  // Page Formats: PNG 300dpi + SVG por página (sempre executado)
  // ---------------------------------------------------------------------------

  /**
   * Renderiza cada página como PNG (300dpi) e SVG vetorial, faz upload
   * ao Supabase Storage e retorna URLs públicas. Se o uploader não estiver
   * configurado, retorna arrays vazios (graceful no-op).
   *
   * Paths no bucket:
   *   {jobId}/pages/png/page-{n}.png
   *   {jobId}/pages/svg/page-{n}.svg
   */
  async extractPageFormats(
    filePath: string,
    jobId: string,
    totalPages: number,
  ): Promise<PageFormats> {
    if (!this.pageUploader) {
      return { png_pages: [], svg_pages: [] };
    }

    const supportsSvg = typeof this.pdfAdapter.renderPageSvg === 'function';
    const png_pages: string[] = new Array(totalPages).fill('');
    const svg_pages: string[] = new Array(totalPages).fill('');

    for (let page = 1; page <= totalPages; page++) {
      try {
        const pngBuffer = await this.pdfAdapter.renderPage(filePath, page, 300);
        const pngPath = `${jobId}/pages/png/page-${page}.png`;
        png_pages[page - 1] = await this.pageUploader.upload(pngPath, pngBuffer, 'image/png');
      } catch (err) {
        logger.warn(`Asset Extraction: falha ao gerar PNG da página ${page}`, err);
      }

      if (supportsSvg) {
        try {
          const svgBuffer = await this.pdfAdapter.renderPageSvg!(filePath, page);
          const svgPath = `${jobId}/pages/svg/page-${page}.svg`;
          svg_pages[page - 1] = await this.pageUploader.upload(
            svgPath, svgBuffer, 'image/svg+xml',
          );
        } catch (err) {
          logger.warn(`Asset Extraction: falha ao gerar SVG da página ${page}`, err);
        }
      }
    }

    return {
      png_pages: png_pages.filter((u) => u !== ''),
      svg_pages: svg_pages.filter((u) => u !== ''),
    };
  }

  // ---------------------------------------------------------------------------
  // Strategy: Embedded Extraction (padrão)
  // ---------------------------------------------------------------------------

  private async extractEmbedded(filePath: string, jobId: string): Promise<ExtractedAsset[]> {
    const rawImages = await this.pdfAdapter.extractImages(filePath);
    const assets: ExtractedAsset[] = [];
    let imageIndex = 0;

    for (const rawImage of rawImages) {
      try {
        const metadata = await sharp(rawImage.data).metadata();
        const width = metadata.width ?? 0;
        const height = metadata.height ?? 0;

        if (width < (this.options.minWidth ?? 100) || height < (this.options.minHeight ?? 100)) {
          continue;
        }

        imageIndex++;
        const id = uuidv4();
        const format = rawImage.format === 'png' ? 'png' : 'jpeg';
        const fileName = `raw/page${String(rawImage.pageNumber).padStart(2, '0')}_img${String(imageIndex).padStart(2, '0')}.${format}`;

        const fileSavePath = await this.storage.save(jobId, fileName, rawImage.data);
        const hash = createHash('sha256').update(rawImage.data).digest('hex');

        const thumbnailPath = await this.saveThumbnail(
          jobId, rawImage.data, rawImage.pageNumber, imageIndex,
        );

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
        continue;
      }
    }

    return assets;
  }

  // ---------------------------------------------------------------------------
  // Strategy: Enhanced (pdfjs-dist geometry + pareamento com bytes do poppler)
  //
  // Sprint 2A close-out (DEV-14 → DEV-15):
  //   1. Usa `PDFJSEnhancedAdapter` para obter geometria por página (CTM stack)
  //   2. Usa o `pdfAdapter` existente (poppler `pdfimages`) para obter os bytes
  //   3. Pareia as duas listas por ordem DENTRO da página — tanto poppler quanto
  //      o operator list do pdfjs iteram imagens na ordem do stream PDF.
  //   4. Normaliza color space via `ColorSpaceManager` quando disponível.
  //   5. Cada asset sai com `geometry` e `imageMetadata` populados.
  //
  // Degradação graciosa:
  //   - Se `pdfjsEnhanced` não foi injetado: cai para `extractEmbedded`.
  //   - Se o pareamento diverge em contagem: usa `Math.min(raws, ops)` e loga.
  //   - Se a normalização de cor falha: preserva buffer original.
  // ---------------------------------------------------------------------------

  private async extractEnhanced(
    filePath: string,
    jobId: string,
  ): Promise<ExtractedAsset[]> {
    if (!this.pdfjsEnhanced) {
      logger.info(
        '[AssetExtractor] enhanced-extraction requested but PDFJSEnhancedAdapter ' +
        'not injected — falling back to embedded-extraction',
      );
      return this.extractEmbedded(filePath, jobId);
    }

    const [reports, rawImages] = await Promise.all([
      this.pdfjsEnhanced.extractPageGeometries(filePath),
      this.pdfAdapter.extractImages(filePath),
    ]);

    // Group raw images by page, preservando ordem original do stream
    const rawByPage = new Map<number, typeof rawImages>();
    for (const img of rawImages) {
      const bucket = rawByPage.get(img.pageNumber);
      if (bucket) {
        bucket.push(img);
      } else {
        rawByPage.set(img.pageNumber, [img]);
      }
    }

    const assets: ExtractedAsset[] = [];

    for (const report of reports) {
      const pageRaws = rawByPage.get(report.pageNumber) ?? [];
      const ops = report.imageOps;
      const pairCount = Math.min(pageRaws.length, ops.length);

      if (pageRaws.length !== ops.length) {
        logger.warn(
          `[AssetExtractor] enhanced: page ${report.pageNumber} has ${pageRaws.length} raw ` +
          `images but ${ops.length} paint ops — pairing min=${pairCount}`,
        );
      }

      for (let i = 0; i < pairCount; i++) {
        const raw = pageRaws[i];
        const op = ops[i];
        if (!raw || !op) continue;

        try {
          let buffer: Buffer = raw.data;
          if (this.colorManager) {
            const normalized = await this.colorManager.normalizeToSrgb(buffer);
            buffer = normalized.buffer;
          }

          const metadata = await sharp(buffer).metadata();
          const width = metadata.width ?? 0;
          const height = metadata.height ?? 0;
          if (
            width < (this.options.minWidth ?? 100) ||
            height < (this.options.minHeight ?? 100)
          ) {
            continue;
          }

          const id = uuidv4();
          const format = raw.format === 'png' ? 'png' : 'jpeg';
          const fileName =
            `enhanced/page${String(raw.pageNumber).padStart(2, '0')}` +
            `_img${String(i + 1).padStart(2, '0')}.${format}`;

          const fileSavePath = await this.storage.save(jobId, fileName, buffer);
          const hash = createHash('sha256').update(buffer).digest('hex');
          const thumbnailPath = await this.saveThumbnail(
            jobId,
            buffer,
            raw.pageNumber,
            i + 1,
          );

          assets.push({
            id,
            filePath: fileSavePath,
            thumbnailPath,
            page: raw.pageNumber,
            dimensions: { width, height },
            format,
            sizeBytes: buffer.length,
            origin: AssetOrigin.PDF_EXTRACTED,
            hash,
            geometry: op.geometry,
            imageMetadata: {
              geometry: op.geometry,
              colorSpace: 'Unknown',
              bitsPerComponent: null,
              hasAlpha: false,
              interpolate: true,
            },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(
            `[AssetExtractor] enhanced: failed to process image ${i} on page ${report.pageNumber}: ${msg}`,
          );
          continue;
        }
      }
    }

    return assets;
  }

  // ---------------------------------------------------------------------------
  // Strategy: Page Render (rasteriza cada página em alta resolução)
  // ---------------------------------------------------------------------------

  private async extractViaPageRender(
    filePath: string,
    jobId: string,
    totalPages: number,
  ): Promise<ExtractedAsset[]> {
    const dpi = this.options.renderDpi ?? 200;
    const assets: ExtractedAsset[] = [];

    for (let page = 1; page <= totalPages; page++) {
      try {
        const buffer = await this.pdfAdapter.renderPage(filePath, page, dpi);
        const metadata = await sharp(buffer).metadata();
        const width = metadata.width ?? 0;
        const height = metadata.height ?? 0;

        const id = uuidv4();
        const fileName = `renders/page${String(page).padStart(2, '0')}_render.png`;
        const fileSavePath = await this.storage.save(jobId, fileName, buffer);
        const hash = createHash('sha256').update(buffer).digest('hex');

        const thumbnailPath = await this.saveThumbnail(jobId, buffer, page, 1, 'render');

        assets.push({
          id,
          filePath: fileSavePath,
          thumbnailPath,
          page,
          dimensions: { width, height },
          format: 'png',
          sizeBytes: buffer.length,
          origin: AssetOrigin.PAGE_RENDER,
          hash,
        });
      } catch {
        continue;
      }
    }

    return assets;
  }

  // ---------------------------------------------------------------------------
  // Strategy: Hybrid (embedded + render para páginas sem assets)
  // ---------------------------------------------------------------------------

  private async extractHybrid(
    filePath: string,
    jobId: string,
    totalPages: number,
  ): Promise<ExtractedAsset[]> {
    // 1. Extrair embutidos
    const embeddedAssets = await this.extractEmbedded(filePath, jobId);

    // 2. Identificar páginas SEM assets embutidos
    const pagesWithAssets = new Set(embeddedAssets.map(a => a.page));
    const pagesWithoutAssets: number[] = [];
    for (let p = 1; p <= totalPages; p++) {
      if (!pagesWithAssets.has(p)) {
        pagesWithoutAssets.push(p);
      }
    }

    // 3. Renderizar apenas as páginas sem assets
    const dpi = this.options.renderDpi ?? 200;
    const renderedAssets: ExtractedAsset[] = [];

    for (const page of pagesWithoutAssets) {
      try {
        const buffer = await this.pdfAdapter.renderPage(filePath, page, dpi);
        const metadata = await sharp(buffer).metadata();
        const width = metadata.width ?? 0;
        const height = metadata.height ?? 0;

        const id = uuidv4();
        const fileName = `renders/page${String(page).padStart(2, '0')}_render.png`;
        const fileSavePath = await this.storage.save(jobId, fileName, buffer);
        const hash = createHash('sha256').update(buffer).digest('hex');

        const thumbnailPath = await this.saveThumbnail(jobId, buffer, page, 1, 'render');

        renderedAssets.push({
          id,
          filePath: fileSavePath,
          thumbnailPath,
          page,
          dimensions: { width, height },
          format: 'png',
          sizeBytes: buffer.length,
          origin: AssetOrigin.PAGE_RENDER,
          hash,
        });
      } catch {
        continue;
      }
    }

    // 4. Combinar e ordenar por página
    return [...embeddedAssets, ...renderedAssets].sort((a, b) => a.page - b.page);
  }

  // ---------------------------------------------------------------------------
  // Upload individual assets to Supabase Storage
  // ---------------------------------------------------------------------------

  /**
   * Faz upload de cada asset extraído (foto individual) ao Supabase Storage.
   * Popula `publicUrl` em cada asset. Se o uploader não estiver configurado,
   * retorna os assets inalterados (graceful no-op).
   *
   * Path no bucket: {jobId}/assets/{assetId}.{format}
   */
  private async uploadIndividualAssets(
    assets: ExtractedAsset[],
    jobId: string,
  ): Promise<ExtractedAsset[]> {
    if (!this.pageUploader || assets.length === 0) {
      return assets;
    }

    const { readFile } = await import('fs/promises');
    const uploaded: ExtractedAsset[] = [];

    for (const asset of assets) {
      try {
        const buffer = await readFile(asset.filePath);
        const contentType = asset.format === 'png' ? 'image/png' : 'image/jpeg';
        const storagePath = `${jobId}/assets/${asset.id}.${asset.format}`;
        const publicUrl = await this.pageUploader.upload(storagePath, buffer, contentType);

        uploaded.push({ ...asset, publicUrl });
        logger.debug(`Asset upload: ${asset.id} → ${storagePath}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`Asset upload failed for ${asset.id}: ${msg}`);
        uploaded.push(asset); // preserve asset without publicUrl
      }
    }

    logger.info(
      `Asset upload: ${uploaded.filter(a => a.publicUrl).length}/${assets.length} assets uploaded to Supabase`,
    );
    return uploaded;
  }

  // ---------------------------------------------------------------------------
  // Thumbnail helper (reutilizado por todas as estratégias)
  // ---------------------------------------------------------------------------

  private async saveThumbnail(
    jobId: string,
    imageData: Buffer,
    page: number,
    index: number,
    suffix?: string,
  ): Promise<string | undefined> {
    if (!this.options.generateThumbnails) return undefined;

    try {
      const thumbBuffer = await sharp(imageData)
        .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      const label = suffix ?? 'img';
      const thumbFileName = `thumbnails/page${String(page).padStart(2, '0')}_${label}${String(index).padStart(2, '0')}_thumb.jpg`;
      return await this.storage.save(jobId, thumbFileName, thumbBuffer);
    } catch {
      return undefined;
    }
  }
}
