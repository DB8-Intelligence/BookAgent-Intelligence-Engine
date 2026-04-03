/**
 * Entity: BrandingProfile
 *
 * Identidade visual extraída do material original.
 * Inclui paleta de cores, estilo visual e padrão de composição.
 * Usado por todos os geradores para manter consistência.
 */

import type { ColorPalette } from '../value-objects/index.js';

export interface BrandingProfile {
  colors: ColorPalette;
  style: string;
  composition: string;
  typography?: string;
}

export const EMPTY_BRANDING: BrandingProfile = {
  colors: { primary: '', secondary: '', accent: '', background: '', text: '' },
  style: '',
  composition: '',
};
