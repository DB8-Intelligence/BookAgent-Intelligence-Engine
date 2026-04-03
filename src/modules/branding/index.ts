/**
 * Módulo: Branding Preservation
 *
 * Identifica e preserva a identidade visual do material original.
 *
 * Estratégia:
 * 1. Lê os assets visuais do contexto (extraídos pelo módulo anterior)
 * 2. Para cada asset, extrai cores dominantes, luminância e saturação
 * 3. Agrega métricas de todos os assets
 * 4. Classifica estilo visual e constrói paleta de 5 cores
 * 5. Calcula score de consistência visual entre assets
 * 6. Popula context.branding com o BrandingProfile completo
 */

import { PipelineStage } from '../../domain/value-objects/index.js';
import { EMPTY_BRANDING } from '../../domain/entities/branding.js';
import type { BrandingProfile } from '../../domain/entities/branding.js';
import type { DominantColor } from '../../domain/value-objects/index.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { logger } from '../../utils/logger.js';

import {
  extractDominantColors,
  calculateAverageLuminance,
  calculateAverageSaturation,
} from './color-analyzer.js';
import { classifyStyle } from './style-classifier.js';
import { buildPalette } from './palette-builder.js';

/** Formatos de imagem suportados para análise de branding */
const SUPPORTED_IMAGE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp', 'tiff']);

/** Máximo de assets a analisar (para performance) */
const MAX_ASSETS_TO_ANALYZE = 20;

export class BrandingModule implements IModule {
  readonly stage = PipelineStage.BRANDING;
  readonly name = 'Branding Preservation';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const assets = context.assets ?? [];

    // Filtrar apenas assets visuais suportados
    const imageAssets = assets
      .filter((a) => SUPPORTED_IMAGE_FORMATS.has(a.format.toLowerCase()))
      .slice(0, MAX_ASSETS_TO_ANALYZE);

    if (imageAssets.length === 0) {
      logger.warn('[Branding] Nenhum asset visual encontrado — usando branding vazio');
      return { ...context, branding: EMPTY_BRANDING };
    }

    logger.info(`[Branding] Analisando ${imageAssets.length} assets visuais...`);

    // Coletar cores dominantes e métricas de todos os assets
    const allDominantColors: DominantColor[] = [];
    const luminances: number[] = [];
    const saturations: number[] = [];
    let analyzedCount = 0;

    for (const asset of imageAssets) {
      try {
        const [colors, luminance, saturation] = await Promise.all([
          extractDominantColors(asset.filePath),
          calculateAverageLuminance(asset.filePath),
          calculateAverageSaturation(asset.filePath),
        ]);

        allDominantColors.push(...colors);
        luminances.push(luminance);
        saturations.push(saturation);
        analyzedCount++;
      } catch (err) {
        logger.warn(`[Branding] Falha ao analisar asset ${asset.id}: ${(err as Error).message}`);
      }
    }

    if (analyzedCount === 0) {
      logger.warn('[Branding] Nenhum asset pôde ser analisado — usando branding vazio');
      return { ...context, branding: EMPTY_BRANDING };
    }

    // Agregar cores: mesclar frequências e deduplicar por proximidade
    const mergedColors = mergeDominantColors(allDominantColors, analyzedCount);

    // Métricas agregadas
    const avgLuminance = luminances.reduce((a, b) => a + b, 0) / luminances.length;
    const avgSaturation = saturations.reduce((a, b) => a + b, 0) / saturations.length;

    // Classificar estilo visual
    const styleAnalysis = classifyStyle(mergedColors, avgLuminance, avgSaturation);

    // Construir paleta de 5 cores
    const palette = buildPalette(mergedColors);

    // Calcular consistência visual entre assets
    const consistencyScore = calculateConsistency(luminances, saturations);

    const branding: BrandingProfile = {
      colors: palette,
      dominantColors: mergedColors,
      style: styleAnalysis.style,
      composition: styleAnalysis.composition,
      typography: styleAnalysis.typography,
      intensity: styleAnalysis.intensity,
      sophistication: styleAnalysis.sophistication,
      averageLuminance: Math.round(avgLuminance),
      averageSaturation: Math.round(avgSaturation * 100) / 100,
      consistencyScore: Math.round(consistencyScore * 100) / 100,
      analyzedAssets: analyzedCount,
    };

    logger.info(
      `[Branding] Perfil completo: style=${branding.style}, ` +
        `palette=[${palette.primary}, ${palette.secondary}, ${palette.accent}], ` +
        `intensity=${branding.intensity}, sophistication=${branding.sophistication}, ` +
        `consistency=${branding.consistencyScore}`,
    );

    return { ...context, branding };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mescla cores dominantes de múltiplos assets.
 *
 * Cores similares (distância RGB < 40) são agrupadas e suas frequências
 * são normalizadas pelo número de assets analisados.
 */
function mergeDominantColors(colors: DominantColor[], assetCount: number): DominantColor[] {
  const MERGE_THRESHOLD = 40;
  const merged: DominantColor[] = [];

  for (const color of colors) {
    const existing = merged.find(
      (m) => rgbDistance(m, color) < MERGE_THRESHOLD,
    );

    if (existing) {
      // Média ponderada pela frequência
      const totalFreq = existing.frequency + color.frequency;
      existing.r = Math.round((existing.r * existing.frequency + color.r * color.frequency) / totalFreq);
      existing.g = Math.round((existing.g * existing.frequency + color.g * color.frequency) / totalFreq);
      existing.b = Math.round((existing.b * existing.frequency + color.b * color.frequency) / totalFreq);
      existing.frequency = totalFreq;
      existing.luminance = 0.299 * existing.r + 0.587 * existing.g + 0.114 * existing.b;
      existing.hex = rgbToHex(existing.r, existing.g, existing.b);
    } else {
      merged.push({ ...color });
    }
  }

  // Normalizar frequências pelo número de assets
  for (const c of merged) {
    c.frequency = c.frequency / assetCount;
  }

  // Ordenar por frequência e limitar a 8
  return merged.sort((a, b) => b.frequency - a.frequency).slice(0, 8);
}

function rgbDistance(a: DominantColor, b: DominantColor): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

/**
 * Calcula score de consistência visual (0-1).
 *
 * Baseado na variância de luminância e saturação entre assets.
 * Baixa variância = alta consistência visual (material coeso).
 */
function calculateConsistency(luminances: number[], saturations: number[]): number {
  if (luminances.length <= 1) return 1;

  const lumVariance = variance(luminances);
  const satVariance = variance(saturations);

  // Normalizar: luminância varia 0-255 (variância max ~16000), saturação 0-1 (variância max ~0.25)
  const lumScore = Math.max(0, 1 - lumVariance / 4000);
  const satScore = Math.max(0, 1 - satVariance / 0.1);

  // Peso: 60% luminância, 40% saturação
  return lumScore * 0.6 + satScore * 0.4;
}

function variance(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}
