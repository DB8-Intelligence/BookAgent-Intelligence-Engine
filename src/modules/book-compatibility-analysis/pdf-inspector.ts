/**
 * PDF Inspector
 *
 * Analisa a estrutura interna de um arquivo PDF para detectar
 * sinais que determinam a melhor estratégia de extração.
 *
 * Técnicas de inspeção:
 * - Contagem de imagens embutidas via marcadores binários
 * - Análise de texto vetorial por página
 * - Detecção de páginas rasterizadas (pouco texto + imagem grande)
 * - Leitura de metadados de criação (Creator, Producer)
 * - Estimativa de resolução das imagens
 */

import { readFile, stat } from 'node:fs/promises';
import type { BookStructureSignals } from '../../domain/entities/book-compatibility.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Marcadores binários de início de imagem */
const JPEG_START = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_START = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** Tamanho mínimo para considerar uma imagem significativa (bytes) */
const MIN_IMAGE_SIZE = 2048;

/** Tamanho mínimo para considerar imagem de alta resolução (bytes) */
const HIGH_RES_THRESHOLD = 50_000;

/** Mínimo de caracteres de texto por página para considerar "com texto" */
const TEXT_RICH_THRESHOLD = 100;

/** Se texto por página < este valor e tem imagem grande, página é rasterizada */
const RASTERIZED_TEXT_THRESHOLD = 30;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Inspeciona um arquivo PDF e retorna sinais estruturais.
 */
export async function inspectPDF(
  filePath: string,
  pageTexts: Array<{ pageNumber: number; text: string }>,
  pageCount: number,
): Promise<BookStructureSignals> {
  const fileBuffer = await readFile(filePath);
  const fileStat = await stat(filePath);

  // 1. Detectar imagens embutidas
  const embeddedImages = detectEmbeddedImages(fileBuffer);
  const avgImageSize = embeddedImages.length > 0
    ? embeddedImages.reduce((sum, s) => sum + s, 0) / embeddedImages.length
    : 0;
  const hasHighRes = embeddedImages.some((size) => size > HIGH_RES_THRESHOLD);
  const totalImageSize = embeddedImages.reduce((sum, s) => sum + s, 0);

  // 2. Analisar texto por página
  const textPerPage = pageTexts.map((p) => p.text.length);
  const avgTextPerPage = textPerPage.length > 0
    ? textPerPage.reduce((sum, l) => sum + l, 0) / textPerPage.length
    : 0;
  const hasVectorText = avgTextPerPage > TEXT_RICH_THRESHOLD;

  // 3. Detectar páginas rasterizadas
  const rasterizedPages = estimateRasterizedPages(pageTexts, embeddedImages.length, pageCount);

  // 4. Detectar metadados de ferramenta de criação
  const creatorTool = extractCreatorTool(fileBuffer);
  const hasLayerIndicators = detectLayerIndicators(fileBuffer, creatorTool);

  // 5. Calcular proporção de páginas com imagens
  const pagesWithImages = estimatePagesWithImages(embeddedImages.length, pageCount);

  return {
    pageCount,
    embeddedImageCount: embeddedImages.length,
    avgEmbeddedImageSize: Math.round(avgImageSize),
    pagesWithEmbeddedImages: pagesWithImages,
    hasVectorText,
    avgTextPerPage: Math.round(avgTextPerPage),
    hasHighResImages: hasHighRes,
    hasRasterizedPages: rasterizedPages.ratio > 0.5,
    rasterizedPageRatio: rasterizedPages.ratio,
    creatorTool,
    hasLayerIndicators,
    fileSizeBytes: fileStat.size,
    imageToFileSizeRatio: fileStat.size > 0 ? totalImageSize / fileStat.size : 0,
  };
}

// ---------------------------------------------------------------------------
// Image detection
// ---------------------------------------------------------------------------

/**
 * Detecta imagens embutidas no buffer do PDF via marcadores binários.
 * Retorna array com tamanho estimado de cada imagem encontrada.
 */
function detectEmbeddedImages(buffer: Buffer): number[] {
  const images: number[] = [];
  let offset = 0;

  while (offset < buffer.length - 4) {
    // JPEG
    if (buffer[offset] === 0xff && buffer[offset + 1] === 0xd8 && buffer[offset + 2] === 0xff) {
      const end = findJPEGEnd(buffer, offset);
      const size = end - offset;
      if (size >= MIN_IMAGE_SIZE) {
        images.push(size);
      }
      offset = end;
      continue;
    }

    // PNG
    if (buffer[offset] === 0x89 && buffer[offset + 1] === 0x50
      && buffer[offset + 2] === 0x4e && buffer[offset + 3] === 0x47) {
      const end = findPNGEnd(buffer, offset);
      const size = end - offset;
      if (size >= MIN_IMAGE_SIZE) {
        images.push(size);
      }
      offset = end;
      continue;
    }

    offset++;
  }

  return images;
}

function findJPEGEnd(buffer: Buffer, start: number): number {
  // Search for JPEG EOI marker (0xFF 0xD9)
  for (let i = start + 3; i < buffer.length - 1; i++) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd9) {
      return i + 2;
    }
  }
  return start + MIN_IMAGE_SIZE; // Fallback
}

function findPNGEnd(buffer: Buffer, start: number): number {
  // Search for PNG IEND marker (0x49 0x45 0x4E 0x44)
  const iend = Buffer.from([0x49, 0x45, 0x4e, 0x44]);
  for (let i = start + 8; i < buffer.length - 8; i++) {
    if (buffer[i] === 0x49 && buffer[i + 1] === 0x45
      && buffer[i + 2] === 0x4e && buffer[i + 3] === 0x44) {
      return i + 8; // IEND chunk + CRC
    }
  }
  return start + MIN_IMAGE_SIZE; // Fallback
}

// ---------------------------------------------------------------------------
// Text analysis
// ---------------------------------------------------------------------------

function estimateRasterizedPages(
  pageTexts: Array<{ pageNumber: number; text: string }>,
  imageCount: number,
  pageCount: number,
): { count: number; ratio: number } {
  if (pageCount === 0) return { count: 0, ratio: 0 };

  // Pages with very little text are likely rasterized
  const lowTextPages = pageTexts.filter(
    (p) => p.text.trim().length < RASTERIZED_TEXT_THRESHOLD,
  ).length;

  // If we have many images relative to pages, AND pages have little text,
  // those pages are likely rasterized (image-as-page)
  const ratio = lowTextPages / pageCount;

  return { count: lowTextPages, ratio: Math.round(ratio * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Metadata extraction
// ---------------------------------------------------------------------------

/**
 * Extracts Creator/Producer metadata from PDF buffer.
 * Looks for /Creator and /Producer entries in the PDF catalog.
 */
function extractCreatorTool(buffer: Buffer): string | null {
  const text = buffer.toString('latin1', 0, Math.min(buffer.length, 100_000));

  // Look for /Creator
  const creatorMatch = text.match(/\/Creator\s*\(([^)]{1,100})\)/);
  if (creatorMatch) return creatorMatch[1];

  // Look for /Producer
  const producerMatch = text.match(/\/Producer\s*\(([^)]{1,100})\)/);
  if (producerMatch) return producerMatch[1];

  return null;
}

/**
 * Detects indicators of layered/composite PDF structure.
 */
function detectLayerIndicators(buffer: Buffer, creatorTool: string | null): boolean {
  // Check creator tool for known layer-capable software
  if (creatorTool) {
    const layerTools = ['illustrator', 'indesign', 'photoshop', 'figma', 'sketch', 'affinity'];
    const lowerCreator = creatorTool.toLowerCase();
    if (layerTools.some((tool) => lowerCreator.includes(tool))) {
      return true;
    }
  }

  // Check for PDF layer markers (/OCG, /OCProperties)
  const headerText = buffer.toString('latin1', 0, Math.min(buffer.length, 200_000));
  return headerText.includes('/OCG') || headerText.includes('/OCProperties');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimatePagesWithImages(imageCount: number, pageCount: number): number {
  if (pageCount === 0) return 0;
  // Rough estimate: assume ~1-2 images per page
  const ratio = Math.min(1, imageCount / pageCount);
  return Math.round(ratio * 100) / 100;
}
