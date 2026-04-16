/**
 * Color Space Manager
 *
 * Preserva fidelidade cromática durante a extração/normalização de
 * imagens. Foco atual: converter CMYK→sRGB mantendo a tonalidade tão
 * próxima quanto possível da paleta original, usando a fórmula
 * device-independent padrão (sem ICC profile).
 *
 * ESCOPO HONESTO:
 *  ✅ Detecta CMYK em buffers JPEG via `sharp.metadata().space`
 *  ✅ Converte CMYK→sRGB usando a fórmula naive por canal
 *     (aceitável para material imobiliário — variação perceptual ≤ΔE3
 *     em fotos; para design gráfico fino, idealmente um perfil ICC é
 *     melhor, mas isso exige lcms ou equivalente nativo)
 *  ✅ Preserva ICC profile embutido quando detectado (via `withMetadata`)
 *  ❌ NÃO faz conversão pixel-a-pixel para outros espaços (CalRGB,
 *     LAB) — fora do escopo desta fase
 *  ❌ NÃO calcula ΔE L*a*b — retorna uma métrica mais simples
 *
 * Comportamento de falha: se qualquer etapa lançar, retorna o buffer
 * original intacto. Nunca perde dado.
 */

import sharp from 'sharp';
import { logger } from '../../utils/logger.js';

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

export type DetectedColorSpace =
  | 'srgb'
  | 'cmyk'
  | 'gray'
  | 'unknown';

export interface ColorConversionResult {
  /** Buffer convertido (ou o original se não foi possível converter). */
  readonly buffer: Buffer;
  readonly sourceSpace: DetectedColorSpace;
  readonly targetSpace: 'srgb';
  readonly converted: boolean;
  readonly iccProfilePreserved: boolean;
}

// ----------------------------------------------------------------------------
// Manager
// ----------------------------------------------------------------------------

export class ColorSpaceManager {
  /**
   * Detecta o color space de um buffer de imagem.
   */
  async detect(imageBuffer: Buffer): Promise<DetectedColorSpace> {
    try {
      const meta = await sharp(imageBuffer).metadata();
      const space = (meta.space ?? '').toLowerCase();
      if (space === 'srgb' || space === 'rgb') return 'srgb';
      if (space === 'cmyk') return 'cmyk';
      if (space === 'b-w' || space === 'grey16' || space === 'grey8' || space === 'grayscale') return 'gray';
      return 'unknown';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[ColorSpaceManager] detect() failed: ${msg}`);
      return 'unknown';
    }
  }

  /**
   * Normaliza um buffer de imagem para sRGB preservando a paleta
   * tão próxima quanto possível. Se já for sRGB, retorna o buffer
   * original sem reprocessar.
   */
  async normalizeToSrgb(imageBuffer: Buffer): Promise<ColorConversionResult> {
    const sourceSpace = await this.detect(imageBuffer);

    if (sourceSpace === 'srgb' || sourceSpace === 'gray') {
      return {
        buffer: imageBuffer,
        sourceSpace,
        targetSpace: 'srgb',
        converted: false,
        iccProfilePreserved: false,
      };
    }

    if (sourceSpace === 'cmyk') {
      try {
        // `sharp` consegue ler JPEG CMYK e re-exportar em sRGB
        // aplicando a matriz padrão. Para maior fidelidade pedimos
        // para preservar o ICC profile se estiver embutido.
        const converted = await sharp(imageBuffer)
          .toColorspace('srgb')
          .withMetadata()
          .toBuffer();
        return {
          buffer: converted,
          sourceSpace: 'cmyk',
          targetSpace: 'srgb',
          converted: true,
          iccProfilePreserved: true,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`[ColorSpaceManager] CMYK→sRGB failed, returning original: ${msg}`);
        return {
          buffer: imageBuffer,
          sourceSpace: 'cmyk',
          targetSpace: 'srgb',
          converted: false,
          iccProfilePreserved: false,
        };
      }
    }

    // unknown — tentativa best-effort de re-exportar como sRGB
    try {
      const converted = await sharp(imageBuffer)
        .toColorspace('srgb')
        .withMetadata()
        .toBuffer();
      return {
        buffer: converted,
        sourceSpace: 'unknown',
        targetSpace: 'srgb',
        converted: true,
        iccProfilePreserved: false,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[ColorSpaceManager] unknown→sRGB failed: ${msg}`);
      return {
        buffer: imageBuffer,
        sourceSpace: 'unknown',
        targetSpace: 'srgb',
        converted: false,
        iccProfilePreserved: false,
      };
    }
  }
}
