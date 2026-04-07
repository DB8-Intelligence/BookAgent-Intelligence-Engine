/**
 * Thumbnail Renderer — Sharp-based image compositor
 *
 * Renders a ThumbnailSpec into a JPEG/PNG image using sharp.
 *
 * Compositing layers (bottom to top):
 *   1. Base asset (resized/cropped to cover)
 *   2. Gradient scrim (dark overlay for text readability)
 *   3. Headline text (SVG overlay)
 *   4. CTA text (SVG overlay, optional)
 *   5. Logo (optional, corner placement)
 *
 * POLÍTICA: a imagem base original nunca é modificada.
 * O thumbnail é uma composição nova.
 *
 * Parte 66: Thumbnail/Cover Engine
 */

import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { v4 as uuid } from 'uuid';

import type { ThumbnailSpec } from '../../domain/entities/thumbnail.js';
import type { Thumbnail } from '../../domain/entities/thumbnail.js';
import {
  CoverLayout,
  ThumbnailFormat,
  ThumbnailStatus,
} from '../../domain/entities/thumbnail.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_BASE = process.env.THUMBNAILS_DIR ?? 'storage/thumbnails';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Renders a single thumbnail from spec.
 */
export async function renderThumbnail(
  spec: ThumbnailSpec,
  jobId: string,
  planId: string,
): Promise<Thumbnail> {
  const outputDir = join(STORAGE_BASE, jobId);
  await mkdir(outputDir, { recursive: true });

  const id = uuid();
  const aspectLabel = `${spec.width}x${spec.height}`;
  const ext = spec.format === ThumbnailFormat.PNG ? 'png' : spec.format === ThumbnailFormat.WEBP ? 'webp' : 'jpg';
  const filename = `thumb-${aspectLabel}-${id.slice(0, 8)}.${ext}`;
  const outputPath = join(outputDir, filename);
  const warnings: string[] = [];

  try {
    let image: sharp.Sharp;

    if (spec.baseAssetPath && existsSync(spec.baseAssetPath) && spec.layout !== CoverLayout.TEXT_ONLY) {
      // Layer 1: Base asset — resize to cover
      image = sharp(spec.baseAssetPath)
        .resize(spec.width, spec.height, { fit: 'cover', position: 'centre' });

      // Layer 2: Gradient scrim for text readability
      const scrimSvg = buildGradientScrimSVG(spec.width, spec.height, spec.style.scrimColor, spec.style.scrimOpacity);
      image = image.composite([
        { input: Buffer.from(scrimSvg), top: 0, left: 0 },
      ]);
    } else {
      // Fallback: solid color background
      image = sharp({
        create: {
          width: spec.width,
          height: spec.height,
          channels: 3,
          background: hexToRGB(spec.style.backgroundColor),
        },
      });
      if (spec.baseAssetPath) {
        warnings.push('Base asset not found — used solid color fallback');
      }
    }

    // Layer 3+4: Text overlays (headline + CTA via SVG)
    const textSvg = buildTextOverlaySVG(spec);
    const composites: sharp.OverlayOptions[] = [
      { input: Buffer.from(textSvg), top: 0, left: 0 },
    ];

    // Layer 5: Logo (optional)
    if (spec.style.showLogo && spec.logoPath && existsSync(spec.logoPath)) {
      try {
        const logoBuffer = await sharp(spec.logoPath)
          .resize(Math.round(spec.width * 0.15), null, { fit: 'inside', withoutEnlargement: true })
          .toBuffer();

        composites.push({
          input: logoBuffer,
          gravity: 'northwest',
        });
      } catch {
        warnings.push('Logo overlay failed — skipped');
      }
    }

    image = image.composite(composites);

    // Output
    if (spec.format === ThumbnailFormat.PNG) {
      await image.png().toFile(outputPath);
    } else if (spec.format === ThumbnailFormat.WEBP) {
      await image.webp({ quality: spec.style.jpegQuality }).toFile(outputPath);
    } else {
      await image.jpeg({ quality: spec.style.jpegQuality }).toFile(outputPath);
    }

    const fileStat = await stat(outputPath);

    logger.info(
      `[ThumbnailRenderer] Generated: ${filename} ` +
      `(${spec.width}x${spec.height}, ${(fileStat.size / 1024).toFixed(1)}KB)`,
    );

    return {
      id,
      jobId,
      planId,
      outputPath,
      filename,
      resolution: [spec.width, spec.height],
      format: spec.format,
      sizeBytes: fileStat.size,
      layout: spec.layout,
      status: ThumbnailStatus.GENERATED,
      aspectRatio: resolveAspectLabel(spec.width, spec.height),
      warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[ThumbnailRenderer] Failed: ${message}`);

    return {
      id,
      jobId,
      planId,
      outputPath: '',
      filename: '',
      resolution: [spec.width, spec.height],
      format: spec.format,
      sizeBytes: 0,
      layout: spec.layout,
      status: ThumbnailStatus.FAILED,
      aspectRatio: resolveAspectLabel(spec.width, spec.height),
      warnings: [...warnings, `Render failed: ${message}`],
    };
  }
}

/**
 * Renders all thumbnail specs for a job.
 */
export async function renderAllThumbnails(
  specs: ThumbnailSpec[],
  jobId: string,
  planId: string,
): Promise<Thumbnail[]> {
  const results: Thumbnail[] = [];

  for (const spec of specs) {
    const thumb = await renderThumbnail(spec, jobId, planId);
    results.push(thumb);
  }

  const generated = results.filter((t) => t.status === ThumbnailStatus.GENERATED).length;
  logger.info(`[ThumbnailRenderer] Batch complete: ${generated}/${specs.length} generated`);

  return results;
}

// ---------------------------------------------------------------------------
// SVG Builders
// ---------------------------------------------------------------------------

/**
 * Gradient scrim — darkens the bottom 60% of the image for text readability.
 */
function buildGradientScrimSVG(
  width: number,
  height: number,
  color: string,
  opacity: number,
): string {
  const rgb = hexToRGBString(color);
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgb(${rgb})" stop-opacity="0"/>
      <stop offset="40%" stop-color="rgb(${rgb})" stop-opacity="0"/>
      <stop offset="100%" stop-color="rgb(${rgb})" stop-opacity="${opacity}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#scrim)"/>
</svg>`;
}

/**
 * Text overlay SVG — headline + optional CTA.
 * Positioned based on layout.
 */
function buildTextOverlaySVG(spec: ThumbnailSpec): string {
  const { width, height, headline, ctaText, style, layout } = spec;
  const headlineSize = style.headlineFontSize;
  const ctaSize = style.ctaFontSize;
  const textColor = style.textColor;
  const accentColor = style.accentColor;

  // Position based on layout
  let headlineY: number;
  let ctaY: number;

  switch (layout) {
    case CoverLayout.FULL_BLEED_CENTER:
      headlineY = Math.round(height * 0.45);
      ctaY = Math.round(height * 0.58);
      break;
    case CoverLayout.SPLIT_TOP_IMAGE:
      headlineY = Math.round(height * 0.65);
      ctaY = Math.round(height * 0.78);
      break;
    case CoverLayout.SPLIT_BOTTOM_IMAGE:
      headlineY = Math.round(height * 0.25);
      ctaY = Math.round(height * 0.38);
      break;
    case CoverLayout.TEXT_ONLY:
      headlineY = Math.round(height * 0.40);
      ctaY = Math.round(height * 0.55);
      break;
    default: // FULL_BLEED_BOTTOM
      headlineY = Math.round(height * 0.75);
      ctaY = Math.round(height * 0.85);
      break;
  }

  const margin = Math.round(width * 0.08);
  const maxTextWidth = width - margin * 2;

  // Wrap headline text
  const wrappedHeadline = wrapSVGText(headline, headlineSize, maxTextWidth);

  let elements = '';

  // Headline
  for (let i = 0; i < wrappedHeadline.length; i++) {
    const lineY = headlineY + i * Math.round(headlineSize * 1.3);
    elements += `<text x="${width / 2}" y="${lineY}" font-family="Arial, Helvetica, sans-serif" font-size="${headlineSize}" font-weight="bold" fill="${textColor}" text-anchor="middle">${escapeSVG(wrappedHeadline[i])}</text>\n`;
  }

  // CTA
  if (ctaText) {
    const adjustedCtaY = ctaY + (wrappedHeadline.length - 1) * Math.round(headlineSize * 0.8);
    // CTA pill background
    const pillWidth = Math.min(ctaText.length * ctaSize * 0.6 + 60, maxTextWidth);
    const pillHeight = ctaSize + 24;
    const pillX = (width - pillWidth) / 2;
    const pillY = adjustedCtaY - pillHeight * 0.7;

    elements += `<rect x="${pillX}" y="${pillY}" width="${pillWidth}" height="${pillHeight}" rx="8" fill="${accentColor}"/>\n`;
    elements += `<text x="${width / 2}" y="${adjustedCtaY}" font-family="Arial, Helvetica, sans-serif" font-size="${ctaSize}" font-weight="bold" fill="${textColor}" text-anchor="middle">${escapeSVG(ctaText)}</text>\n`;
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
${elements}
</svg>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToRGB(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function hexToRGBString(hex: string): string {
  const { r, g, b } = hexToRGB(hex);
  return `${r},${g},${b}`;
}

function escapeSVG(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Simple word-wrap for SVG text (no native wrapping in SVG) */
function wrapSVGText(text: string, fontSize: number, maxWidth: number): string[] {
  const avgCharWidth = fontSize * 0.55; // Approximate for sans-serif
  const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth);
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }

  if (currentLine) lines.push(currentLine);

  // Limit to 3 lines max
  if (lines.length > 3) {
    const truncated = lines.slice(0, 3);
    truncated[2] = truncated[2].slice(0, -3) + '...';
    return truncated;
  }

  return lines;
}

function resolveAspectLabel(width: number, height: number): string {
  const ratio = width / height;
  if (Math.abs(ratio - 9 / 16) < 0.05) return '9:16';
  if (Math.abs(ratio - 1) < 0.05) return '1:1';
  if (Math.abs(ratio - 16 / 9) < 0.05) return '16:9';
  if (Math.abs(ratio - 4 / 5) < 0.05) return '4:5';
  return `${width}:${height}`;
}
