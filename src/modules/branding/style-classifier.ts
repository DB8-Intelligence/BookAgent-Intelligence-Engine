/**
 * Style Classifier
 *
 * Classifica o estilo visual de um material com base nas cores e
 * métricas visuais extraídas.
 *
 * v1: Classificação por heurísticas (regras baseadas em cor e luminância).
 * Evolução futura: classificação via IAIAdapter (Gemini Vision / GPT-4 Vision).
 *
 * Heurísticas:
 * - Cores escuras + saturação alta + poucos tons quentes → luxury-modern
 * - Cores quentes + saturação média + luminância alta → resort
 * - Cores frias + saturação baixa + luminância alta → minimal
 * - Cores vibrantes + variação alta → urban-modern
 * - Tons pastéis + saturação baixa → luxury-classic
 * - Cores primárias + saturação média → popular
 * - Tons cinza/azul corporativo → corporate
 */

import type { DominantColor } from '../../domain/value-objects/index.js';
import { VisualStyle, VisualIntensity, SophisticationLevel } from '../../domain/value-objects/index.js';

export interface StyleAnalysis {
  style: VisualStyle;
  intensity: VisualIntensity;
  sophistication: SophisticationLevel;
  typography: string;
  composition: string;
}

/**
 * Classifica o estilo visual do material com base nas cores e métricas.
 */
export function classifyStyle(
  dominantColors: DominantColor[],
  avgLuminance: number,
  avgSaturation: number,
): StyleAnalysis {
  const style = classifyVisualStyle(dominantColors, avgLuminance, avgSaturation);
  const intensity = classifyIntensity(avgSaturation, dominantColors.length);
  const sophistication = classifySophistication(dominantColors, avgSaturation, avgLuminance);
  const typography = inferTypography(style);
  const composition = inferComposition(style);

  return { style, intensity, sophistication, typography, composition };
}

function classifyVisualStyle(
  colors: DominantColor[],
  avgLuminance: number,
  avgSaturation: number,
): VisualStyle {
  if (colors.length === 0) return VisualStyle.MINIMAL;

  const hasWarmColors = colors.some((c) => c.r > 150 && c.r > c.b);
  const hasCoolColors = colors.some((c) => c.b > 150 && c.b > c.r);
  const hasDarkTones = avgLuminance < 100;
  const hasLightTones = avgLuminance > 170;
  const isDesaturated = avgSaturation < 0.2;
  const isVibrant = avgSaturation > 0.5;

  // luxury-modern: escuro + saturado + frio
  if (hasDarkTones && !isDesaturated && hasCoolColors) {
    return VisualStyle.LUXURY_MODERN;
  }

  // luxury-classic: luminância média + dessaturado + cores quentes sutis
  if (!hasDarkTones && !hasLightTones && isDesaturated && hasWarmColors) {
    return VisualStyle.LUXURY_CLASSIC;
  }

  // resort: luminância alta + cores quentes + saturação média
  if (hasLightTones && hasWarmColors && avgSaturation > 0.3) {
    return VisualStyle.RESORT;
  }

  // urban-modern: vibrante + variação de cores
  if (isVibrant && colors.length >= 4) {
    return VisualStyle.URBAN_MODERN;
  }

  // minimal: luminância alta + dessaturado
  if (hasLightTones && isDesaturated) {
    return VisualStyle.MINIMAL;
  }

  // corporate: azul/cinza dominante
  if (hasCoolColors && !hasWarmColors && avgSaturation < 0.4) {
    return VisualStyle.CORPORATE;
  }

  // popular: cores primárias + saturação média
  if (isVibrant && hasWarmColors) {
    return VisualStyle.POPULAR;
  }

  // fallback baseado na luminância
  if (hasDarkTones) return VisualStyle.LUXURY_MODERN;
  return VisualStyle.URBAN_MODERN;
}

function classifyIntensity(avgSaturation: number, colorCount: number): VisualIntensity {
  if (avgSaturation > 0.45 && colorCount >= 4) return VisualIntensity.HIGH;
  if (avgSaturation < 0.2 || colorCount <= 2) return VisualIntensity.LOW;
  return VisualIntensity.MEDIUM;
}

function classifySophistication(
  colors: DominantColor[],
  avgSaturation: number,
  avgLuminance: number,
): SophisticationLevel {
  // Premium: paleta restrita (3-5 cores), não vibrante demais, boa luminância
  const colorVariety = colors.length;

  if (colorVariety <= 5 && avgSaturation < 0.5 && avgLuminance > 60 && avgLuminance < 200) {
    return SophisticationLevel.PREMIUM;
  }

  if (avgSaturation > 0.6 || colorVariety > 6) {
    return SophisticationLevel.BASIC;
  }

  return SophisticationLevel.STANDARD;
}

/**
 * Infere categoria de tipografia baseada no estilo visual.
 * v1: heurística. Evolução: análise via LLM Vision.
 */
function inferTypography(style: VisualStyle): string {
  switch (style) {
    case VisualStyle.LUXURY_MODERN:
      return 'sans-serif';
    case VisualStyle.LUXURY_CLASSIC:
      return 'serif';
    case VisualStyle.URBAN_MODERN:
      return 'sans-serif';
    case VisualStyle.RESORT:
      return 'sans-serif';
    case VisualStyle.POPULAR:
      return 'sans-serif';
    case VisualStyle.CORPORATE:
      return 'sans-serif';
    case VisualStyle.MINIMAL:
      return 'sans-serif';
    default:
      return 'sans-serif';
  }
}

/**
 * Infere padrão de composição baseado no estilo visual.
 * v1: heurística. Evolução: análise de layout via LLM Vision.
 */
function inferComposition(style: VisualStyle): string {
  switch (style) {
    case VisualStyle.LUXURY_MODERN:
      return 'full-bleed';
    case VisualStyle.LUXURY_CLASSIC:
      return 'centered';
    case VisualStyle.URBAN_MODERN:
      return 'asymmetric';
    case VisualStyle.RESORT:
      return 'full-bleed';
    case VisualStyle.POPULAR:
      return 'grid';
    case VisualStyle.CORPORATE:
      return 'grid';
    case VisualStyle.MINIMAL:
      return 'centered';
    default:
      return 'grid';
  }
}
