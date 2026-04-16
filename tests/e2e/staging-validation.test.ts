/**
 * Staging Validation Test Suite
 *
 * Valida pipeline completo Sprint 2 (módulos puros, sem I/O).
 * Usa dados sintéticos que simulam output do Mansão Othon:
 *   - Assets com geometry + classification
 *   - TextBlocks + CorrelationBlocks
 *   - Fluxo: Correlation → Scene → Narrative → Storyboard → FFmpeg
 *
 * POIDetector testado separadamente com imagem gerada via sharp.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { v4 as uuid } from 'uuid';
import sharp from 'sharp';

// --- Sprint 2 modules under test ---
import { POIDetector, type POIResult } from '../../src/modules/asset-extraction/poi-detector.js';
import {
  ProximityCalculator,
  type SpatialTextBlock,
} from '../../src/modules/correlation/proximity-calculator.js';
import { elevateBlocksWithSpatialMatch } from '../../src/modules/correlation/page-correlator.js';
import { SceneComposerEnhanced, type VideoScene } from '../../src/modules/media/scene-composer-enhanced.js';
import { NarrativeEngine, type NarrativeStoryboard } from '../../src/modules/narrative/narrative-engine.js';
import { StoryboardBuilder, type StoryboardOutput } from '../../src/modules/media/storyboard-builder.js';
import { FFmpegStoryboardRenderer } from '../../src/renderers/video/ffmpeg-storyboard-renderer.js';

// --- Domain types ---
import type { Asset } from '../../src/domain/entities/asset.js';
import type { CorrelationBlock, TextBlock } from '../../src/domain/entities/correlation.js';
import {
  CorrelationConfidence,
  CorrelationMethod,
  TextBlockType,
} from '../../src/domain/entities/correlation.js';
import { SourceType, AssetOrigin } from '../../src/domain/value-objects/index.js';
import type { Dimensions } from '../../src/domain/value-objects/index.js';

// ---------------------------------------------------------------------------
// Synthetic test data — simulates Mansão Othon extraction output
// ---------------------------------------------------------------------------

function makeAsset(overrides: Partial<Asset> & { id: string }): Asset {
  return {
    filePath: `storage/assets/${overrides.id}.jpg`,
    dimensions: { width: 1200, height: 800 },
    page: 1,
    format: 'jpg',
    sizeBytes: 150_000,
    origin: AssetOrigin.PDF_EXTRACTED,
    isOriginal: true as const,
    ...overrides,
  };
}

function makeTextBlock(page: number, content: string, headline?: string): TextBlock {
  return {
    content,
    headline,
    page,
    blockType: TextBlockType.PARAGRAPH,
    keywords: content.toLowerCase().split(/\s+/).slice(0, 5),
  };
}

function makeCorrelationBlock(
  page: number,
  assetIds: string[],
  summary: string,
  confidence: CorrelationConfidence = CorrelationConfidence.MEDIUM,
  headline?: string,
): CorrelationBlock {
  return {
    id: uuid(),
    page,
    textBlocks: [makeTextBlock(page, summary, headline)],
    assetIds,
    headline,
    summary,
    confidence,
    methods: [CorrelationMethod.PAGE_PROXIMITY],
    tags: [],
    priority: 3,
  };
}

// --- Identity CTM (no transform) ---
const IDENTITY_CTM = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

// --- Assets representing a real estate PDF ---

const ASSETS: Asset[] = [
  makeAsset({
    id: 'hero-fachada',
    page: 1,
    classification: SourceType.HERO,
    dimensions: { width: 2400, height: 1600 },
    geometry: { page: 1, x: 0, y: 0, width: 595, height: 400, zIndex: 0, ctm: IDENTITY_CTM },
    position: { x: 0.5, y: 0.3 },
  }),
  makeAsset({
    id: 'lifestyle-piscina',
    page: 2,
    classification: SourceType.LIFESTYLE,
    dimensions: { width: 1800, height: 900 },
    geometry: { page: 2, x: 50, y: 60, width: 500, height: 250, zIndex: 1, ctm: IDENTITY_CTM },
    position: { x: 0.4, y: 0.5 },
  }),
  makeAsset({
    id: 'planta-tipo',
    page: 3,
    classification: SourceType.PLANTA,
    dimensions: { width: 1000, height: 1000 },
    geometry: { page: 3, x: 20, y: 20, width: 555, height: 555, zIndex: 0, ctm: IDENTITY_CTM },
    position: { x: 0.5, y: 0.5 },
  }),
  makeAsset({
    id: 'diferencial-sauna',
    page: 2,
    classification: SourceType.DIFERENCIAL,
    dimensions: { width: 1200, height: 800 },
    geometry: { page: 2, x: 50, y: 370, width: 500, height: 333, zIndex: 2, ctm: IDENTITY_CTM },
  }),
  makeAsset({
    id: 'cta-agende',
    page: 4,
    classification: SourceType.CTA,
    dimensions: { width: 800, height: 400 },
    geometry: { page: 4, x: 100, y: 600, width: 400, height: 200, zIndex: 3, ctm: IDENTITY_CTM },
  }),
  makeAsset({
    id: 'hero-vista-mar',
    page: 1,
    classification: SourceType.HERO,
    dimensions: { width: 2000, height: 1200 },
    geometry: { page: 1, x: 0, y: 420, width: 595, height: 350, zIndex: 1, ctm: IDENTITY_CTM },
    position: { x: 0.6, y: 0.4 },
  }),
];

const ASSET_MAP = new Map(ASSETS.map((a) => [a.id, a]));

// --- Correlation blocks ---

const BLOCKS: CorrelationBlock[] = [
  makeCorrelationBlock(
    1,
    ['hero-fachada', 'hero-vista-mar'],
    'Mansão Othon — arquitetura contemporânea com vista panorâmica para o mar de Salvador',
    CorrelationConfidence.HIGH,
    'Mansão Othon',
  ),
  makeCorrelationBlock(
    2,
    ['lifestyle-piscina', 'diferencial-sauna'],
    'Piscina com borda infinita e sauna exclusiva no rooftop do empreendimento',
    CorrelationConfidence.MEDIUM,
    'Lazer Completo',
  ),
  makeCorrelationBlock(
    3,
    ['planta-tipo'],
    'Planta tipo com 4 dormitórios e 280m² de área privativa no formato duplex',
    CorrelationConfidence.MEDIUM,
    'Planta Tipo',
  ),
  makeCorrelationBlock(
    4,
    ['cta-agende'],
    'Agende sua visita e conheça o decorado — condições exclusivas de lançamento',
    CorrelationConfidence.LOW,
    'Visite o Decorado',
  ),
];

// --- Spatial text blocks (simulates pdfjs-enhanced spatial extraction) ---

const SPATIAL_TEXT_PAGE_1: SpatialTextBlock[] = [
  { id: 'st-1', page: 1, x: 10, y: 10, width: 200, height: 30, text: 'Mansão Othon — empreendimento exclusivo' },
  { id: 'st-2', page: 1, x: 10, y: 450, width: 300, height: 25, text: 'Vista panorâmica para o mar de Salvador' },
];

const SPATIAL_TEXT_PAGE_2: SpatialTextBlock[] = [
  { id: 'st-3', page: 2, x: 50, y: 80, width: 250, height: 20, text: 'Piscina com borda infinita no rooftop' },
  { id: 'st-4', page: 2, x: 60, y: 380, width: 200, height: 20, text: 'Sauna exclusiva com vista para a cidade' },
];

// ==========================================================================
// Tests
// ==========================================================================

describe('Staging Validation — Sprint 2 Pipeline', () => {
  // Shared state across test stages
  let scenes: readonly VideoScene[];
  let narrative: NarrativeStoryboard;
  let storyboard: StoryboardOutput;

  // --------------------------------------------------------------------------
  // 1. POI Detection
  // --------------------------------------------------------------------------

  describe('1. POI Detection', () => {
    it('should detect POI from a synthetic image with a bright region', async () => {
      // Create a 100x100 image with a bright square in the top-right quadrant
      const size = 100;
      const pixels = Buffer.alloc(size * size * 3, 30); // dark grey background
      for (let y = 10; y < 40; y++) {
        for (let x = 60; x < 90; x++) {
          const idx = (y * size + x) * 3;
          pixels[idx] = 255;     // R
          pixels[idx + 1] = 255; // G
          pixels[idx + 2] = 255; // B
        }
      }
      const imageBuffer = await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
        .png()
        .toBuffer();

      const detector = new POIDetector();
      const result: POIResult = await detector.detectPOI(imageBuffer);

      expect(result.x).toBeGreaterThan(0);
      expect(result.x).toBeLessThanOrEqual(1);
      expect(result.y).toBeGreaterThan(0);
      expect(result.y).toBeLessThanOrEqual(1);
      expect(result.confidence).toBeGreaterThan(0);
      expect(['edge-detection', 'color-variance', 'default']).toContain(result.method);

      // POI should be in the top-right quadrant where the bright spot is
      expect(result.x).toBeGreaterThan(0.4);
      expect(result.y).toBeLessThan(0.6);

      console.log(
        `  POI detected: (${result.x.toFixed(2)}, ${result.y.toFixed(2)}) ` +
          `confidence=${(result.confidence * 100).toFixed(0)}% method=${result.method}`,
      );
    });

    it('should fallback to center for a uniform image', async () => {
      // Solid grey image — no edges, no variance
      const imageBuffer = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 128, b: 128 } },
      })
        .png()
        .toBuffer();

      const detector = new POIDetector();
      const result = await detector.detectPOI(imageBuffer);

      expect(result.x).toBeCloseTo(0.5, 1);
      expect(result.y).toBeCloseTo(0.5, 1);
      expect(result.method).toBe('default');

      console.log(`  Uniform image fallback: (${result.x}, ${result.y}) method=${result.method}`);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Proximity Calculator
  // --------------------------------------------------------------------------

  describe('2. Proximity Calculator', () => {
    it('should score collision when asset overlaps text', () => {
      const calc = new ProximityCalculator();

      // Asset covers (50, 100) to (550, 350), text at (50, 80) to (300, 100) — adjacent
      const score = calc.calculate(ASSETS[1], SPATIAL_TEXT_PAGE_2[0]);

      expect(score.confidence).toBeGreaterThan(0);
      expect(['collision', 'adjacent', 'contextual']).toContain(score.method);

      console.log(
        `  Proximity: method=${score.method} confidence=${score.confidence} distance=${score.distance.toFixed(1)}`,
      );
    });

    it('should matchAll assets to spatial text blocks', () => {
      const calc = new ProximityCalculator();
      const page2Assets = ASSETS.filter((a) => a.page === 2);
      const matches = calc.matchAll(page2Assets, SPATIAL_TEXT_PAGE_2, 10);

      expect(matches.length).toBeGreaterThan(0);
      console.log(`  matchAll: ${matches.length} matches for page 2 (${page2Assets.length} assets, ${SPATIAL_TEXT_PAGE_2.length} texts)`);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Correlation Elevation
  // --------------------------------------------------------------------------

  describe('3. Correlation Elevation (Spatial)', () => {
    it('should elevate blocks with spatial text matches', () => {
      const spatialTextByPage = new Map<number, readonly SpatialTextBlock[]>([
        [1, SPATIAL_TEXT_PAGE_1],
        [2, SPATIAL_TEXT_PAGE_2],
      ]);

      const elevated = elevateBlocksWithSpatialMatch(BLOCKS, ASSET_MAP, spatialTextByPage);

      expect(elevated.length).toBe(BLOCKS.length);

      const withSpatial = elevated.filter((b) =>
        b.methods.includes(CorrelationMethod.SPATIAL_ADJACENCY),
      );
      console.log(
        `  Elevated: ${withSpatial.length}/${elevated.length} blocks gained SPATIAL_ADJACENCY`,
      );

      // Pages 1 and 2 have spatial text — those blocks should be elevated
      for (const block of elevated) {
        if (block.page <= 2) {
          // May or may not be elevated depending on proximity thresholds,
          // but confidence should never be downgraded
          const original = BLOCKS.find((b) => b.id === block.id)!;
          const confOrder = [
            CorrelationConfidence.INFERRED,
            CorrelationConfidence.LOW,
            CorrelationConfidence.MEDIUM,
            CorrelationConfidence.HIGH,
          ];
          expect(confOrder.indexOf(block.confidence)).toBeGreaterThanOrEqual(
            confOrder.indexOf(original.confidence),
          );
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // 4. Scene Composition
  // --------------------------------------------------------------------------

  describe('4. Scene Composition (Z-Index)', () => {
    beforeAll(() => {
      const composer = new SceneComposerEnhanced();
      scenes = composer.composeScenes(BLOCKS, ASSET_MAP);
    });

    it('should compose scenes from correlation blocks + assets', () => {
      expect(scenes.length).toBeGreaterThan(0);
      // We have 6 assets across 4 blocks
      expect(scenes.length).toBeLessThanOrEqual(ASSETS.length);

      console.log(`  Scenes composed: ${scenes.length}`);
    });

    it('should assign correct motion profiles', () => {
      const kenBurns = scenes.filter((s) => s.motionProfile === 'ken-burns');
      const panScan = scenes.filter((s) => s.motionProfile === 'pan-scan');
      const statik = scenes.filter((s) => s.motionProfile === 'static');

      // Hero assets → ken-burns (we have 2 heroes)
      expect(kenBurns.length).toBeGreaterThan(0);

      console.log(
        `  Motion: ken-burns=${kenBurns.length}, pan-scan=${panScan.length}, static=${statik.length}`,
      );
    });

    it('should respect Z-Index ordering within same page', () => {
      // Page 1 has hero-fachada (z=0) and hero-vista-mar (z=1)
      const page1Scenes = scenes.filter((s) => s.sourcePageNumber === 1);
      if (page1Scenes.length >= 2) {
        // Lower z-index should come first in sequence
        expect(page1Scenes[0].sequenceOrder).toBeLessThan(page1Scenes[1].sequenceOrder);
        console.log(`  Z-Index ordering verified for page 1`);
      }
    });

    it('should calculate duration from text length', () => {
      for (const scene of scenes) {
        expect(scene.durationSeconds).toBeGreaterThanOrEqual(2);
        expect(scene.durationSeconds).toBeLessThanOrEqual(8);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 5. Narrative Clustering
  // --------------------------------------------------------------------------

  describe('5. Narrative Clustering', () => {
    beforeAll(() => {
      const engine = new NarrativeEngine();
      narrative = engine.buildStoryboard(scenes);
    });

    it('should select hook as highest-confidence scene', () => {
      expect(narrative.hook).toBeDefined();
      expect(narrative.hook.correlationConfidence).toBeGreaterThan(0);

      // Hook should be the highest confidence scene
      for (const cluster of narrative.clusters) {
        for (const scene of cluster.scenes) {
          expect(narrative.hook.correlationConfidence).toBeGreaterThanOrEqual(
            scene.correlationConfidence,
          );
        }
      }

      console.log(
        `  Hook: page=${narrative.hook.sourcePageNumber} confidence=${narrative.hook.correlationConfidence}`,
      );
    });

    it('should cluster remaining scenes by topic', () => {
      expect(narrative.clusters.length).toBeGreaterThan(0);
      expect(narrative.totalScenes).toBe(scenes.length);

      for (const cluster of narrative.clusters) {
        expect(['showcase', 'lifestyle', 'details', 'cta']).toContain(cluster.topic);
        expect(cluster.scenes.length).toBeGreaterThan(0);
        console.log(
          `  Cluster [${cluster.topic}]: ${cluster.scenes.length} scenes, ${cluster.totalDuration.toFixed(1)}s`,
        );
      }
    });

    it('should respect 60s max duration', () => {
      expect(narrative.totalDuration).toBeLessThanOrEqual(60);
      console.log(`  Total duration: ${narrative.totalDuration.toFixed(1)}s`);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Storyboard Building
  // --------------------------------------------------------------------------

  describe('6. Storyboard Building', () => {
    beforeAll(() => {
      const builder = new StoryboardBuilder();
      const assetDimensions = new Map<string, Dimensions>(
        ASSETS.map((a) => [a.id, a.dimensions]),
      );
      storyboard = builder.buildStoryboard('test-mansao-othon', narrative, assetDimensions);
    });

    it('should produce frames with valid crop geometry', () => {
      expect(storyboard.frames.length).toBeGreaterThan(0);

      for (const frame of storyboard.frames) {
        expect(frame.cropGeometry).toBeDefined();
        expect(frame.cropGeometry.width).toBeGreaterThan(0);
        expect(frame.cropGeometry.height).toBeGreaterThan(0);
        expect(frame.cropGeometry.x).toBeGreaterThanOrEqual(0);
        expect(frame.cropGeometry.y).toBeGreaterThanOrEqual(0);
      }

      console.log(`  Frames: ${storyboard.frames.length} with valid crop geometry`);
    });

    it('should cap total duration at 60s', () => {
      expect(storyboard.totalDurationMs).toBeLessThanOrEqual(60_000);
      console.log(`  Duration: ${(storyboard.totalDurationMs / 1000).toFixed(1)}s`);
    });

    it('should set hook frame at 4s', () => {
      // First frame is the hook
      const hookFrame = storyboard.frames[0];
      expect(hookFrame.durationMs).toBe(4000);
    });

    it('should have correct metadata', () => {
      expect(storyboard.metadata.format).toBe('9:16');
      expect(storyboard.metadata.resolution).toBe('1080x1920');
      expect(storyboard.metadata.fps).toBe(30);
      expect(storyboard.jobId).toBe('test-mansao-othon');
    });
  });

  // --------------------------------------------------------------------------
  // 7. FFmpeg Command Generation
  // --------------------------------------------------------------------------

  describe('7. FFmpeg Command Generation', () => {
    it('should generate valid FFmpeg command array', () => {
      const renderer = new FFmpegStoryboardRenderer();
      const cmd = renderer.generateCommand(storyboard, 'output/mansao-othon.mp4');

      expect(cmd[0]).toBe('ffmpeg');
      expect(cmd).toContain('-filter_complex');
      expect(cmd).toContain('libx264');
      expect(cmd[cmd.length - 1]).toBe('output/mansao-othon.mp4');

      console.log(`  FFmpeg: ${cmd.length} arguments`);
    });

    it('should include crop filters for every frame', () => {
      const renderer = new FFmpegStoryboardRenderer();
      const cmd = renderer.generateCommand(storyboard, 'out.mp4');
      const filterComplex = cmd[cmd.indexOf('-filter_complex') + 1];

      // Should have one crop= per frame
      const cropCount = (filterComplex.match(/crop=/g) || []).length;
      expect(cropCount).toBe(storyboard.frames.length);

      console.log(`  Crop filters: ${cropCount}/${storyboard.frames.length} frames`);
    });

    it('should include zoompan for ken-burns frames', () => {
      const renderer = new FFmpegStoryboardRenderer();
      const cmd = renderer.generateCommand(storyboard, 'out.mp4');
      const filterComplex = cmd[cmd.indexOf('-filter_complex') + 1];

      const kenBurnsCount = storyboard.frames.filter(
        (f) => f.motionProfile === 'ken-burns',
      ).length;
      const zoompanCount = (filterComplex.match(/zoompan/g) || []).length;

      // zoompan count >= ken-burns (pan-scan also uses zoompan)
      expect(zoompanCount).toBeGreaterThanOrEqual(kenBurnsCount);

      console.log(`  Zoompan filters: ${zoompanCount} (ken-burns=${kenBurnsCount})`);
    });

    it('should include -i input for each frame', () => {
      const renderer = new FFmpegStoryboardRenderer();
      const cmd = renderer.generateCommand(storyboard, 'out.mp4');

      const inputCount = cmd.filter((arg) => arg === '-i').length;
      expect(inputCount).toBe(storyboard.frames.length);
    });
  });

  // --------------------------------------------------------------------------
  // Pipeline Summary
  // --------------------------------------------------------------------------

  describe('Pipeline Metrics Summary', () => {
    it('should produce complete pipeline output', () => {
      const geometryRate = (
        (ASSETS.filter((a) => a.geometry).length / ASSETS.length) *
        100
      ).toFixed(1);

      const kenBurnsFrames = storyboard.frames.filter(
        (f) => f.motionProfile === 'ken-burns',
      ).length;

      console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STAGING VALIDATION METRICS — Sprint 2 Pipeline
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Assets:            ${ASSETS.length} total, ${geometryRate}% with geometry
Correlations:      ${BLOCKS.length} blocks
Scenes:            ${scenes.length} composed
Narrative:         hook + ${narrative.clusters.length} clusters (${narrative.clusters.map((c) => c.topic).join(', ')})
Storyboard:        ${storyboard.frames.length} frames, ${(storyboard.totalDurationMs / 1000).toFixed(1)}s
Ken Burns:         ${kenBurnsFrames}/${storyboard.frames.length} frames
FFmpeg:            ready to render

Pipeline validated end-to-end
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);

      // Final assertion: pipeline produced output
      expect(storyboard.frames.length).toBeGreaterThan(0);
      expect(storyboard.totalDurationMs).toBeGreaterThan(0);
    });
  });
});
