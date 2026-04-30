/**
 * CLIP-based POI Detection
 *
 * Uses @huggingface/transformers for zero-shot image classification
 * to detect the point of interest in real estate images.
 *
 * Strategy:
 *   1. Divide image into 3x3 grid (9 regions)
 *   2. Classify each region against real estate prompts
 *   3. Find region with highest "main subject" confidence
 *   4. Return center of that region as POI (normalized 0..1)
 *
 * No GPU required — runs in Node.js via ONNX Runtime.
 * Model: Xenova/clip-vit-base-patch32 (~350MB, cached after first load)
 *
 * Fallback: returns center (0.5, 0.5) if CLIP fails.
 */

import sharp from 'sharp';
import { logger } from '../../utils/logger.js';
import type { POIResult } from './poi-detector.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CLIPPOIResult extends POIResult {
  readonly method: 'clip' | 'default';
  /** Per-prompt max confidence across all grid regions */
  readonly promptScores: Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------
// Prompts — tuned for real estate photography
// ---------------------------------------------------------------------------

const SUBJECT_PROMPTS = [
  'main building facade or entrance',
  'swimming pool or water feature',
  'interior room with furniture',
  'garden or landscape view',
  'architectural detail or balcony',
];

const BACKGROUND_PROMPTS = [
  'empty sky or clouds',
  'plain wall or floor',
  'blurred background',
];

const ALL_PROMPTS = [...SUBJECT_PROMPTS, ...BACKGROUND_PROMPTS];

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

// Lazy singleton — model loads on first call, cached for subsequent calls
let classifierInstance: unknown = null;
let loadPromise: Promise<unknown> | null = null;

async function getClassifier(): Promise<unknown> {
  if (classifierInstance) return classifierInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    logger.info('[CLIPPOIDetector] Loading CLIP model (first call may take 30-60s)...');
    const { pipeline, env } = await import('@huggingface/transformers');
    // Use default cache dir
    env.cacheDir = './.transformers-cache';

    const classifier = await pipeline(
      'zero-shot-image-classification',
      'Xenova/clip-vit-base-patch32',
    );
    classifierInstance = classifier;
    logger.info('[CLIPPOIDetector] CLIP model loaded and cached');
    return classifier;
  })();

  return loadPromise;
}

export class CLIPPOIDetector {
  private readonly gridSize: number;

  constructor(gridSize: number = 3) {
    this.gridSize = gridSize;
  }

  /**
   * Detect POI using CLIP zero-shot classification on a spatial grid.
   */
  async detectPOI(imageBuffer: Buffer): Promise<CLIPPOIResult> {
    try {
      const classifier = (await getClassifier()) as (
        image: unknown,
        labels: string[],
      ) => Promise<Array<{ label: string; score: number }>>;

      const { RawImage } = await import('@huggingface/transformers');

      const metadata = await sharp(imageBuffer).metadata();
      const width = metadata.width ?? 1200;
      const height = metadata.height ?? 800;

      const cellWidth = Math.floor(width / this.gridSize);
      const cellHeight = Math.floor(height / this.gridSize);

      // Classify each grid cell
      const regionScores: Array<{
        col: number;
        row: number;
        subjectScore: number;
        bestPrompt: string;
      }> = [];

      for (let row = 0; row < this.gridSize; row++) {
        for (let col = 0; col < this.gridSize; col++) {
          try {
            const cropBuffer = await sharp(imageBuffer)
              .extract({
                left: col * cellWidth,
                top: row * cellHeight,
                width: cellWidth,
                height: cellHeight,
              })
              .resize(224, 224)
              .removeAlpha()
              .raw()
              .toBuffer();

            // Create RawImage from pixel data for transformers.js
            const rawImage = new RawImage(
              new Uint8ClampedArray(cropBuffer),
              224,
              224,
              3,
            );

            const results = await classifier(rawImage, ALL_PROMPTS);

            // Sum scores for subject prompts vs background prompts
            let subjectScore = 0;
            let bestPrompt = '';
            let bestScore = 0;

            for (const r of results) {
              if (SUBJECT_PROMPTS.includes(r.label)) {
                subjectScore += r.score;
                if (r.score > bestScore) {
                  bestScore = r.score;
                  bestPrompt = r.label;
                }
              }
            }

            regionScores.push({ col, row, subjectScore, bestPrompt });
          } catch (err) {
            logger.warn(
              `[CLIPPOIDetector] Failed to classify region [${row},${col}]:`,
              err,
            );
            regionScores.push({ col, row, subjectScore: 0, bestPrompt: '' });
          }
        }
      }

      // Find region with highest subject score
      const best = regionScores.reduce((a, b) =>
        b.subjectScore > a.subjectScore ? b : a,
      );

      const poiX = (best.col + 0.5) / this.gridSize;
      const poiY = (best.row + 0.5) / this.gridSize;
      const confidence = Math.min(1, best.subjectScore);

      // Build per-prompt max scores for diagnostics
      const promptScores: Record<string, number> = {};
      for (const prompt of ALL_PROMPTS) {
        promptScores[prompt] = 0;
      }
      // We only have aggregate subject scores per region, so use best prompt
      if (best.bestPrompt) {
        promptScores[best.bestPrompt] = confidence;
      }

      logger.info(
        `[CLIPPOIDetector] POI: (${poiX.toFixed(2)}, ${poiY.toFixed(2)}) ` +
          `conf=${(confidence * 100).toFixed(0)}% prompt="${best.bestPrompt}"`,
      );

      return {
        x: poiX,
        y: poiY,
        confidence,
        method: 'clip',
        promptScores,
      };
    } catch (err) {
      logger.error('[CLIPPOIDetector] Detection failed, returning center:', err);
      return {
        x: 0.5,
        y: 0.5,
        confidence: 0,
        method: 'default',
        promptScores: {},
      };
    }
  }
}
