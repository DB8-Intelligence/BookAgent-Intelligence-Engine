/**
 * Video Geometry — Safe Crop for 9:16 / 4:5 / 1:1 with POI awareness
 *
 * Módulo puro (sem I/O) que calcula o rect de crop ideal para um asset
 * adaptar-se a um aspect ratio alvo SEM distorção, respeitando um Point
 * of Interest (POI) normalizado 0..1.
 *
 * REGRAS DE FIDELIDADE (ver docs/VISUAL_FIDELITY_PRINCIPLES.md):
 *  - NUNCA escala não-uniforme.
 *  - Crop centrado no POI quando o asset é mais largo ou mais alto que o alvo.
 *  - Se POI não fornecido, usa centro (0.5, 0.5) como fallback seguro.
 *  - O crop resultante SEMPRE respeita os limites do asset original
 *    (nunca extrapola; clamp para 0..w / 0..h).
 *
 * NÃO implementa ken burns, zoom, rotação, distorção ou letterbox-com-preencher.
 * Letterbox puro é responsabilidade do renderer (FFmpeg `pad=...` ou Shotstack).
 */

import type { Dimensions } from '../../../domain/value-objects/index.js';

// ----------------------------------------------------------------------------
// Tipos públicos
// ----------------------------------------------------------------------------

/** Ponto normalizado 0..1 no sistema da imagem (origem top-left). */
export interface NormalizedPoint {
  readonly x: number;
  readonly y: number;
}

/** Aspect ratios suportados — use um dos presets ou forneça razão custom. */
export type AspectRatioPreset = '9:16' | '4:5' | '1:1' | '16:9';

export interface AspectRatio {
  readonly width: number;
  readonly height: number;
}

export const ASPECT_PRESETS: Readonly<Record<AspectRatioPreset, AspectRatio>> = {
  '9:16': { width: 9, height: 16 },
  '4:5':  { width: 4, height: 5 },
  '1:1':  { width: 1, height: 1 },
  '16:9': { width: 16, height: 9 },
};

/**
 * Retângulo de crop no espaço de pixel do asset original.
 * `method` descreve o caso aplicado — útil para logging e debugging.
 */
export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly method: 'no-crop' | 'crop-horizontal' | 'crop-vertical';
  /** POI efetivamente usado no cálculo (pode ter sido clampado). */
  readonly appliedPoi: NormalizedPoint;
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export class VideoGeometry {
  /**
   * Calcula o crop que encaixa `source` no `targetRatio` sem distorção,
   * centrado no `poi` (se fornecido) ou no centro da imagem (fallback).
   *
   * Cases:
   *   - source ratio > target ratio  → crop horizontal (perde laterais)
   *   - source ratio < target ratio  → crop vertical (perde topo/base)
   *   - source ratio = target ratio  → sem crop, retorna dims originais
   */
  static calculateSafeCrop(
    source: Dimensions,
    targetRatio: AspectRatio | AspectRatioPreset = '9:16',
    poi?: NormalizedPoint,
  ): CropRect {
    const target = typeof targetRatio === 'string'
      ? ASPECT_PRESETS[targetRatio]
      : targetRatio;
    const targetRatioValue = target.width / target.height;
    const sourceRatioValue = source.width / source.height;

    // POI default = centro. Sempre normalizado entre 0..1.
    const rawPoi: NormalizedPoint = poi ?? { x: 0.5, y: 0.5 };
    const appliedPoi: NormalizedPoint = {
      x: clamp(rawPoi.x, 0, 1),
      y: clamp(rawPoi.y, 0, 1),
    };

    // Tolerância de 0.1% para "aspects iguais"
    if (Math.abs(sourceRatioValue - targetRatioValue) < 0.001) {
      return {
        x: 0,
        y: 0,
        width: source.width,
        height: source.height,
        method: 'no-crop',
        appliedPoi,
      };
    }

    if (sourceRatioValue > targetRatioValue) {
      // Asset mais largo que o alvo → cortar laterais
      const cropWidth = source.height * targetRatioValue;
      const maxX = source.width - cropWidth;
      // Centraliza o POI horizontalmente no crop
      const desiredX = source.width * appliedPoi.x - cropWidth / 2;
      const x = clamp(desiredX, 0, maxX);
      return {
        x: Math.round(x),
        y: 0,
        width: Math.round(cropWidth),
        height: source.height,
        method: 'crop-horizontal',
        appliedPoi,
      };
    }

    // sourceRatioValue < targetRatioValue → cortar topo/base
    const cropHeight = source.width / targetRatioValue;
    const maxY = source.height - cropHeight;
    const desiredY = source.height * appliedPoi.y - cropHeight / 2;
    const y = clamp(desiredY, 0, maxY);
    return {
      x: 0,
      y: Math.round(y),
      width: source.width,
      height: Math.round(cropHeight),
      method: 'crop-vertical',
      appliedPoi,
    };
  }

  /**
   * Retorna `true` se o crop calculado descarta mais de `threshold` fração
   * do asset original. Útil para detectar cortes excessivos e preferir
   * letterbox no renderer ao invés de perder conteúdo.
   *
   * `threshold` default = 0.30 (30%).
   */
  static isCropExcessive(
    source: Dimensions,
    crop: CropRect,
    threshold: number = 0.3,
  ): boolean {
    const sourceArea = source.width * source.height;
    const cropArea = crop.width * crop.height;
    if (sourceArea <= 0) return true;
    const keptRatio = cropArea / sourceArea;
    return keptRatio < 1 - threshold;
  }
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
