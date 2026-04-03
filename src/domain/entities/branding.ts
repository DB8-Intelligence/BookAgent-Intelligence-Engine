/**
 * Entity: BrandingProfile
 *
 * Identidade visual completa extraída do material original.
 *
 * Usado por todos os módulos geradores (media, blog, landing-page,
 * personalization) para manter consistência visual entre outputs
 * e o material de origem.
 */

import type {
  ColorPalette,
  DominantColor,
  VisualStyle,
  VisualIntensity,
  SophisticationLevel,
} from '../value-objects/index.js';

export interface BrandingProfile {
  /** Paleta de 5 cores derivada das dominantes */
  colors: ColorPalette;

  /** Todas as cores dominantes extraídas (ordenadas por frequência) */
  dominantColors: DominantColor[];

  /** Estilo visual classificado (luxury-modern, urban, resort, etc.) */
  style: VisualStyle | string;

  /** Padrão de composição do layout (full-bleed, grid, centered, etc.) */
  composition: string;

  /** Categoria de tipografia detectada (serif, sans-serif, display, etc.) */
  typography: string;

  /** Intensidade visual (high = muitas cores vibrantes, low = clean/minimal) */
  intensity: VisualIntensity;

  /** Nível de sofisticação (premium, standard, basic) */
  sophistication: SophisticationLevel;

  /** Luminância média das imagens (0-255) — dark vs light */
  averageLuminance: number;

  /** Saturação média (0-1) — vibrante vs dessaturado */
  averageSaturation: number;

  /** Score de consistência visual entre assets (0-1) */
  consistencyScore: number;

  /** Número de assets analisados para este branding */
  analyzedAssets: number;
}

export const EMPTY_BRANDING: BrandingProfile = {
  colors: { primary: '', secondary: '', accent: '', background: '', text: '' },
  dominantColors: [],
  style: '',
  composition: '',
  typography: '',
  intensity: 'medium' as VisualIntensity,
  sophistication: 'standard' as SophisticationLevel,
  averageLuminance: 128,
  averageSaturation: 0.5,
  consistencyScore: 0,
  analyzedAssets: 0,
};
