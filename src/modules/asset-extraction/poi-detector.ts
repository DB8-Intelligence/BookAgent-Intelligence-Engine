/**
 * POI (Point of Interest) Detector
 *
 * Detecta onde está o objeto mais saliente na imagem usando análise
 * de gradiente (bordas) e variância de cor. Output normalizado 0..1.
 *
 * Estratégia multi-método (fallback cascade):
 *  1. Edge detection (Sobel simplificado em greyscale 100x100)
 *  2. Color variance (vizinhança 3x3 em RGB 50x50)
 *  3. Centro da imagem (0.5, 0.5) como fallback seguro
 *
 * Módulo puro — recebe Buffer, retorna coordenadas. Sem I/O de disco.
 */

import sharp from 'sharp';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface POIResult {
  /** Coordenada X normalizada 0..1 (esquerda → direita) */
  readonly x: number;
  /** Coordenada Y normalizada 0..1 (topo → base) */
  readonly y: number;
  /** Confiança da detecção 0..1 */
  readonly confidence: number;
  /** Método que produziu o resultado */
  readonly method: 'edge-detection' | 'color-variance' | 'default';
}

// ---------------------------------------------------------------------------
// Implementação
// ---------------------------------------------------------------------------

export class POIDetector {
  /**
   * Detectar Point of Interest em uma imagem.
   */
  async detectPOI(imageBuffer: Buffer): Promise<POIResult> {
    try {
      const edges = await this.detectEdges(imageBuffer);
      if (edges && edges.confidence > 0.5) {
        return edges;
      }

      const variance = await this.detectColorVariance(imageBuffer);
      if (variance && variance.confidence > 0.5) {
        return variance;
      }

      return { x: 0.5, y: 0.5, confidence: 0.3, method: 'default' };
    } catch (err) {
      logger.warn('[POIDetector] detection failed, using center fallback:', err);
      return { x: 0.5, y: 0.5, confidence: 0, method: 'default' };
    }
  }

  // -------------------------------------------------------------------------
  // Edge detection (Sobel simplificado)
  // -------------------------------------------------------------------------

  private async detectEdges(imageBuffer: Buffer): Promise<POIResult | null> {
    try {
      const SIZE = 100;
      const { data } = await sharp(imageBuffer)
        .resize(SIZE, SIZE, { fit: 'cover' })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      let maxGradient = 0;
      let maxX = SIZE / 2;
      let maxY = SIZE / 2;

      for (let y = 1; y < SIZE - 1; y++) {
        for (let x = 1; x < SIZE - 1; x++) {
          const idx = y * SIZE + x;
          const gx = (data[idx - 1] ?? 0) - (data[idx + 1] ?? 0);
          const gy = (data[idx - SIZE] ?? 0) - (data[idx + SIZE] ?? 0);
          const gradient = Math.sqrt(gx * gx + gy * gy);

          if (gradient > maxGradient) {
            maxGradient = gradient;
            maxX = x;
            maxY = y;
          }
        }
      }

      if (maxGradient > 50) {
        return {
          x: maxX / SIZE,
          y: maxY / SIZE,
          confidence: Math.min(1, maxGradient / 255),
          method: 'edge-detection',
        };
      }

      return null;
    } catch (err) {
      logger.warn('[POIDetector] edge detection failed:', err);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Color variance (vizinhança 3x3)
  // -------------------------------------------------------------------------

  private async detectColorVariance(
    imageBuffer: Buffer,
  ): Promise<POIResult | null> {
    try {
      const SIZE = 50;
      const result = await sharp(imageBuffer)
        .resize(SIZE, SIZE, { fit: 'cover' })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const data = result.data;
      const channels = result.info.channels;

      let maxVariance = 0;
      let maxX = SIZE / 2;
      let maxY = SIZE / 2;

      for (let y = 2; y < SIZE - 2; y++) {
        for (let x = 2; x < SIZE - 2; x++) {
          let variance = 0;

          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;

              const idx1 = ((y + dy) * SIZE + (x + dx)) * channels;
              const idx2 = (y * SIZE + x) * channels;

              for (let c = 0; c < Math.min(3, channels); c++) {
                const diff = Math.abs(
                  (data[idx1 + c] ?? 0) - (data[idx2 + c] ?? 0),
                );
                variance += diff * diff;
              }
            }
          }

          if (variance > maxVariance) {
            maxVariance = variance;
            maxX = x;
            maxY = y;
          }
        }
      }

      if (maxVariance > 1000) {
        return {
          x: maxX / SIZE,
          y: maxY / SIZE,
          confidence: Math.min(1, maxVariance / 10000),
          method: 'color-variance',
        };
      }

      return null;
    } catch (err) {
      logger.warn('[POIDetector] color variance detection failed:', err);
      return null;
    }
  }
}
