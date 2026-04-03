/**
 * Palette Builder
 *
 * Transforma uma lista de cores dominantes em uma ColorPalette
 * de 5 cores (primary, secondary, accent, background, text).
 *
 * Estratégia:
 * 1. Primary: cor com maior frequência (excluindo cinzas puros)
 * 2. Secondary: segunda cor mais frequente (com distância mínima da primary)
 * 3. Accent: cor mais saturada (vibrante) entre as restantes
 * 4. Background: cor mais clara (maior luminância)
 * 5. Text: cor mais escura (menor luminância)
 */

import type { ColorPalette, DominantColor } from '../../domain/value-objects/index.js';

const MIN_DISTANCE_BETWEEN_ROLES = 50;

/**
 * Constrói uma ColorPalette de 5 cores a partir das dominantes.
 */
export function buildPalette(dominantColors: DominantColor[]): ColorPalette {
  if (dominantColors.length === 0) {
    return { primary: '#333333', secondary: '#666666', accent: '#0066cc', background: '#f5f5f5', text: '#1a1a1a' };
  }

  if (dominantColors.length === 1) {
    const c = dominantColors[0];
    return {
      primary: c.hex,
      secondary: darken(c, 30),
      accent: saturate(c),
      background: '#f5f5f5',
      text: '#1a1a1a',
    };
  }

  // Separar cores por luminância
  const sorted = [...dominantColors].sort((a, b) => b.frequency - a.frequency);
  const byLuminance = [...dominantColors].sort((a, b) => a.luminance - b.luminance);

  // Primary: mais frequente (excluindo cinzas)
  const primary = sorted.find((c) => !isGray(c)) ?? sorted[0];

  // Secondary: segunda mais frequente com distância mínima da primary
  const secondary =
    sorted.find(
      (c) => c.hex !== primary.hex && rgbDistance(c, primary) > MIN_DISTANCE_BETWEEN_ROLES,
    ) ??
    sorted.find((c) => c.hex !== primary.hex) ??
    primary;

  // Accent: cor mais saturada entre as restantes
  const used = new Set([primary.hex, secondary.hex]);
  const remaining = sorted.filter((c) => !used.has(c.hex));
  const accent =
    remaining.sort((a, b) => saturation(b) - saturation(a))[0] ?? saturateColor(primary);

  // Background: cor mais clara
  const background = byLuminance[byLuminance.length - 1];

  // Text: cor mais escura
  const textColor = byLuminance[0];

  return {
    primary: primary.hex,
    secondary: secondary.hex,
    accent: accent.hex ?? accent.toString(),
    background: background.luminance > 200 ? background.hex : '#f5f5f5',
    text: textColor.luminance < 80 ? textColor.hex : '#1a1a1a',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isGray(c: DominantColor): boolean {
  const diff = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  return diff < 20;
}

function saturation(c: DominantColor): number {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  return max === 0 ? 0 : (max - min) / max;
}

function rgbDistance(a: DominantColor, b: DominantColor): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function darken(c: DominantColor, amount: number): string {
  const r = Math.max(0, c.r - amount);
  const g = Math.max(0, c.g - amount);
  const b = Math.max(0, c.b - amount);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function saturate(c: DominantColor): string {
  const factor = 1.3;
  const avg = (c.r + c.g + c.b) / 3;
  const r = Math.min(255, Math.round(avg + (c.r - avg) * factor));
  const g = Math.min(255, Math.round(avg + (c.g - avg) * factor));
  const b = Math.min(255, Math.round(avg + (c.b - avg) * factor));
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function saturateColor(c: DominantColor): DominantColor {
  const hex = saturate(c);
  return { ...c, hex };
}
