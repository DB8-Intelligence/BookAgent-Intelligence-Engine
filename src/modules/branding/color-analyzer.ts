/**
 * Color Analyzer
 *
 * Extrai cores dominantes de imagens usando sharp.
 *
 * Estratégia:
 * 1. Redimensionar a imagem para 64x64 (amostragem rápida)
 * 2. Extrair todos os pixels como buffer RGB
 * 3. Quantizar cores agrupando por proximidade (simplified k-means)
 * 4. Ordenar por frequência
 * 5. Retornar top N cores dominantes com frequência relativa
 *
 * A luminância é calculada com a fórmula perceptual:
 *   L = 0.299*R + 0.587*G + 0.114*B
 *
 * A saturação é calculada como:
 *   S = (max(R,G,B) - min(R,G,B)) / max(R,G,B)
 */

import sharp from 'sharp';
import type { DominantColor } from '../../domain/value-objects/index.js';

/** Tamanho da amostra (imagem redimensionada para análise) */
const SAMPLE_SIZE = 64;

/** Distância mínima entre cores para considerá-las diferentes (em RGB euclidiano) */
const COLOR_DISTANCE_THRESHOLD = 35;

/** Número máximo de cores dominantes retornadas */
const MAX_COLORS = 8;

/**
 * Extrai cores dominantes de uma imagem.
 *
 * @param imageInput - Buffer da imagem ou path do arquivo
 * @returns Cores dominantes ordenadas por frequência (mais frequente primeiro)
 */
export async function extractDominantColors(imageInput: Buffer | string): Promise<DominantColor[]> {
  // Redimensionar para amostra pequena e extrair raw pixels RGB
  const { data, info } = await sharp(imageInput)
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const totalPixels = info.width * info.height;
  const pixelColors: Array<[number, number, number]> = [];

  // Ler cada pixel como (R, G, B)
  for (let i = 0; i < data.length; i += 3) {
    pixelColors.push([data[i], data[i + 1], data[i + 2]]);
  }

  // Quantizar: agrupar cores similares
  const clusters = quantizeColors(pixelColors);

  // Converter para DominantColor e ordenar por frequência
  const dominants: DominantColor[] = clusters
    .map((cluster) => {
      const r = Math.round(cluster.center[0]);
      const g = Math.round(cluster.center[1]);
      const b = Math.round(cluster.center[2]);
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

      return {
        hex: rgbToHex(r, g, b),
        r,
        g,
        b,
        frequency: cluster.count / totalPixels,
        luminance,
      };
    })
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, MAX_COLORS);

  return dominants;
}

/**
 * Calcula a luminância média de uma imagem (0-255).
 */
export async function calculateAverageLuminance(imageInput: Buffer | string): Promise<number> {
  const stats = await sharp(imageInput).stats();
  // stats.channels[0] = R, [1] = G, [2] = B
  const rMean = stats.channels[0]?.mean ?? 128;
  const gMean = stats.channels[1]?.mean ?? 128;
  const bMean = stats.channels[2]?.mean ?? 128;
  return 0.299 * rMean + 0.587 * gMean + 0.114 * bMean;
}

/**
 * Calcula a saturação média de uma imagem (0-1).
 */
export async function calculateAverageSaturation(imageInput: Buffer | string): Promise<number> {
  const { data } = await sharp(imageInput)
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let totalSaturation = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 3) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    totalSaturation += saturation;
    count++;
  }

  return count > 0 ? totalSaturation / count : 0;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

interface ColorCluster {
  center: [number, number, number];
  count: number;
}

/**
 * Quantização simples de cores: agrupa pixels por proximidade euclidiana.
 * Não é k-means completo, mas é rápido e suficiente para paletas de books.
 */
function quantizeColors(pixels: Array<[number, number, number]>): ColorCluster[] {
  const clusters: ColorCluster[] = [];

  for (const pixel of pixels) {
    // Ignorar pixels quase brancos (>240) ou quase pretos (<15)
    // pois raramente são parte do branding real
    if (pixel[0] > 240 && pixel[1] > 240 && pixel[2] > 240) continue;
    if (pixel[0] < 15 && pixel[1] < 15 && pixel[2] < 15) continue;

    let merged = false;
    for (const cluster of clusters) {
      const dist = colorDistance(pixel, cluster.center);
      if (dist < COLOR_DISTANCE_THRESHOLD) {
        // Média ponderada do centro
        const total = cluster.count + 1;
        cluster.center = [
          (cluster.center[0] * cluster.count + pixel[0]) / total,
          (cluster.center[1] * cluster.count + pixel[1]) / total,
          (cluster.center[2] * cluster.count + pixel[2]) / total,
        ];
        cluster.count = total;
        merged = true;
        break;
      }
    }

    if (!merged) {
      clusters.push({ center: [...pixel], count: 1 });
    }
  }

  return clusters.filter((c) => c.count > 5);
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}
