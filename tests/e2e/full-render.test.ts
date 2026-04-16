/**
 * Full-Render Validation Test
 *
 * Executa FFmpeg REAL com imagens sintéticas que simulam o output
 * do pipeline Mansão Othon. Valida:
 *  - Storyboard → FFmpeg command generation
 *  - FFmpeg execution (render real, não mock)
 *  - Output: file exists, codec H.264, resolution 1080x1920
 *  - First frame extraction for visual inspection
 *
 * Pré-requisitos: FFmpeg + FFprobe instalados no PATH.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, statSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import sharp from 'sharp';
import { v4 as uuid } from 'uuid';

import { SceneComposerEnhanced, type VideoScene } from '../../src/modules/media/scene-composer-enhanced.js';
import { NarrativeEngine, type NarrativeStoryboard } from '../../src/modules/narrative/narrative-engine.js';
import { StoryboardBuilder, type StoryboardOutput } from '../../src/modules/media/storyboard-builder.js';
import { FFmpegStoryboardRenderer } from '../../src/renderers/video/ffmpeg-storyboard-renderer.js';
import type { Asset } from '../../src/domain/entities/asset.js';
import type { CorrelationBlock } from '../../src/domain/entities/correlation.js';
import {
  CorrelationConfidence,
  CorrelationMethod,
  TextBlockType,
} from '../../src/domain/entities/correlation.js';
import { SourceType, AssetOrigin } from '../../src/domain/value-objects/index.js';
import type { Dimensions } from '../../src/domain/value-objects/index.js';

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolve(process.cwd(), 'tests/fixtures');
const OUTPUT_DIR = resolve(process.cwd(), 'output');
const OUTPUT_VIDEO = resolve(OUTPUT_DIR, 'render-test.mp4');
const FIRST_FRAME = resolve(OUTPUT_DIR, 'first-frame.png');

// ---------------------------------------------------------------------------
// Synthetic image generation — simulate Mansão Othon assets
// ---------------------------------------------------------------------------

async function generateTestImage(
  path: string,
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
  label: string,
): Promise<void> {
  // Create a solid color image with a gradient region for POI detection
  const img = sharp({
    create: { width, height, channels: 3, background: color },
  });

  // Add a bright region in the center-right as a focal point
  const overlayWidth = Math.round(width * 0.3);
  const overlayHeight = Math.round(height * 0.3);
  const overlay = await sharp({
    create: {
      width: overlayWidth,
      height: overlayHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .png()
    .toBuffer();

  await img
    .composite([
      {
        input: overlay,
        left: Math.round(width * 0.5),
        top: Math.round(height * 0.3),
      },
    ])
    .jpeg({ quality: 90 })
    .toFile(path);
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const IDENTITY_CTM = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

const IMAGE_SPECS = [
  { id: 'hero-fachada', w: 2400, h: 1600, color: { r: 40, g: 60, b: 90 }, label: 'Fachada' },
  { id: 'lifestyle-pool', w: 1800, h: 900, color: { r: 30, g: 120, b: 160 }, label: 'Piscina' },
  { id: 'planta-tipo', w: 1000, h: 1000, color: { r: 240, g: 235, b: 220 }, label: 'Planta' },
];

function makeAssets(): Asset[] {
  return IMAGE_SPECS.map((spec, i) => ({
    id: spec.id,
    filePath: resolve(FIXTURES_DIR, `${spec.id}.jpg`),
    dimensions: { width: spec.w, height: spec.h },
    page: i + 1,
    format: 'jpg',
    sizeBytes: 150_000,
    origin: AssetOrigin.PDF_EXTRACTED,
    isOriginal: true as const,
    classification:
      i === 0 ? SourceType.HERO : i === 1 ? SourceType.LIFESTYLE : SourceType.PLANTA,
    geometry: {
      page: i + 1,
      x: 0,
      y: 0,
      width: 595,
      height: 400,
      zIndex: 0,
      ctm: IDENTITY_CTM,
    },
    position: { x: 0.6, y: 0.4 },
  }));
}

function makeBlocks(assets: Asset[]): CorrelationBlock[] {
  return [
    {
      id: uuid(),
      page: 1,
      assetIds: ['hero-fachada'],
      textBlocks: [
        {
          content: 'Mansão Othon — arquitetura contemporânea com vista panorâmica para o mar',
          page: 1,
          blockType: TextBlockType.HEADLINE,
          keywords: ['fachada', 'arquitetura', 'vista'],
        },
      ],
      headline: 'Mansão Othon',
      summary: 'Mansão Othon — arquitetura contemporânea com vista panorâmica',
      confidence: CorrelationConfidence.HIGH,
      methods: [CorrelationMethod.PAGE_PROXIMITY],
      tags: ['fachada'],
      priority: 1,
    },
    {
      id: uuid(),
      page: 2,
      assetIds: ['lifestyle-pool'],
      textBlocks: [
        {
          content: 'Piscina com borda infinita e sauna exclusiva no rooftop',
          page: 2,
          blockType: TextBlockType.PARAGRAPH,
          keywords: ['piscina', 'sauna', 'rooftop'],
        },
      ],
      headline: 'Lazer Completo',
      summary: 'Piscina com borda infinita e sauna exclusiva',
      confidence: CorrelationConfidence.MEDIUM,
      methods: [CorrelationMethod.PAGE_PROXIMITY],
      tags: ['piscina'],
      priority: 3,
    },
    {
      id: uuid(),
      page: 3,
      assetIds: ['planta-tipo'],
      textBlocks: [
        {
          content: 'Planta tipo com 4 dormitórios e 280m² de área privativa',
          page: 3,
          blockType: TextBlockType.PARAGRAPH,
          keywords: ['planta', 'dormitório', 'm²'],
        },
      ],
      headline: 'Planta Tipo',
      summary: 'Planta tipo com 4 dormitórios e 280m²',
      confidence: CorrelationConfidence.MEDIUM,
      methods: [CorrelationMethod.PAGE_PROXIMITY],
      tags: ['planta'],
      priority: 5,
    },
  ];
}

// ==========================================================================
// Tests
// ==========================================================================

describe('Full-Render Validation', () => {
  let assets: Asset[];
  let storyboard: StoryboardOutput;
  let ffmpegArgs: readonly string[];

  // --------------------------------------------------------------------------
  // Setup: generate synthetic images
  // --------------------------------------------------------------------------

  beforeAll(async () => {
    if (!existsSync(FIXTURES_DIR)) mkdirSync(FIXTURES_DIR, { recursive: true });
    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

    // Generate test images
    for (const spec of IMAGE_SPECS) {
      const path = resolve(FIXTURES_DIR, `${spec.id}.jpg`);
      if (!existsSync(path)) {
        await generateTestImage(path, spec.w, spec.h, spec.color, spec.label);
      }
    }
  }, 30_000);

  // --------------------------------------------------------------------------
  // 1. Pipeline: assets → scenes → narrative → storyboard
  // --------------------------------------------------------------------------

  describe('1. Pipeline to Storyboard', () => {
    it('should build storyboard from synthetic assets', () => {
      assets = makeAssets();
      const blocks = makeBlocks(assets);
      const assetMap = new Map(assets.map((a) => [a.id, a]));

      const scenes = new SceneComposerEnhanced().composeScenes(blocks, assetMap);
      expect(scenes.length).toBe(3);

      const narrative = new NarrativeEngine().buildStoryboard(scenes);
      expect(narrative.hook).toBeDefined();

      const dims = new Map<string, Dimensions>(
        assets.map((a) => [a.id, a.dimensions]),
      );
      storyboard = new StoryboardBuilder().buildStoryboard('render-test', narrative, dims);

      expect(storyboard.frames.length).toBe(3);
      expect(storyboard.totalDurationMs).toBeGreaterThan(0);
      expect(storyboard.totalDurationMs).toBeLessThanOrEqual(60_000);

      console.log(
        `  Pipeline: ${storyboard.frames.length} frames, ${(storyboard.totalDurationMs / 1000).toFixed(1)}s`,
      );
    });
  });

  // --------------------------------------------------------------------------
  // 2. FFmpeg command generation
  // --------------------------------------------------------------------------

  describe('2. FFmpeg Command', () => {
    it('should generate command with real file paths', () => {
      const renderer = new FFmpegStoryboardRenderer();
      const rawArgs = renderer.generateCommand(storyboard, OUTPUT_VIDEO);

      // Fix asset paths: storyboard uses "assets/{id}.jpg" but real files
      // are in tests/fixtures/{id}.jpg
      ffmpegArgs = rawArgs.map((arg) => {
        if (arg.startsWith('assets/') && arg.endsWith('.jpg')) {
          const filename = arg.replace('assets/', '');
          return resolve(FIXTURES_DIR, filename);
        }
        return arg;
      });

      expect(ffmpegArgs[0]).toBe('ffmpeg');
      expect(ffmpegArgs[ffmpegArgs.length - 1]).toBe(OUTPUT_VIDEO);

      // Verify all input files exist
      for (let i = 0; i < ffmpegArgs.length; i++) {
        if (ffmpegArgs[i] === '-i') {
          const inputPath = ffmpegArgs[i + 1];
          expect(existsSync(inputPath)).toBe(true);
        }
      }

      console.log(`  FFmpeg: ${ffmpegArgs.length} args, inputs verified`);
    });
  });

  // --------------------------------------------------------------------------
  // 3. FFmpeg execution (REAL render)
  // --------------------------------------------------------------------------

  describe('3. FFmpeg Render', () => {
    it(
      'should render video successfully',
      async () => {
        // Add -y to overwrite existing output
        const args = [...ffmpegArgs];
        args.splice(1, 0, '-y');
        const cmdStr = args.join(' ');

        console.log(`\n  Rendering video (may take 10-30s)...`);

        const { stderr } = await execAsync(cmdStr, {
          timeout: 120_000,
          maxBuffer: 10 * 1024 * 1024,
        });

        expect(existsSync(OUTPUT_VIDEO)).toBe(true);

        const stats = statSync(OUTPUT_VIDEO);
        expect(stats.size).toBeGreaterThan(10_000); // at least 10KB

        console.log(`  Render complete: ${(stats.size / 1024).toFixed(0)}KB`);
      },
      120_000,
    );
  });

  // --------------------------------------------------------------------------
  // 4. Output validation (ffprobe)
  // --------------------------------------------------------------------------

  describe('4. Output Validation', () => {
    it('should have valid H.264 codec', async () => {
      const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${OUTPUT_VIDEO}"`;
      const { stdout } = await execAsync(cmd);

      expect(stdout.trim()).toBe('h264');
      console.log(`  Codec: ${stdout.trim()}`);
    });

    it('should have 1080x1920 resolution', async () => {
      const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "${OUTPUT_VIDEO}"`;
      const { stdout } = await execAsync(cmd);

      expect(stdout.trim()).toBe('1080x1920');
      console.log(`  Resolution: ${stdout.trim()}`);
    });

    it('should have expected duration', async () => {
      const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${OUTPUT_VIDEO}"`;
      const { stdout } = await execAsync(cmd);
      const durationSec = parseFloat(stdout.trim());

      // Duration should be reasonable (at least 2s, at most 90s)
      expect(durationSec).toBeGreaterThan(2);
      expect(durationSec).toBeLessThan(90);

      console.log(`  Duration: ${durationSec.toFixed(1)}s`);
    });

    it('should have valid frame rate', async () => {
      const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of default=noprint_wrappers=1:nokey=1 "${OUTPUT_VIDEO}"`;
      const { stdout } = await execAsync(cmd);

      // FFmpeg may output "30/1" or "30000/1001" etc
      const parts = stdout.trim().split('/');
      const fps = parseInt(parts[0]) / parseInt(parts[1] || '1');
      expect(fps).toBeGreaterThanOrEqual(24);
      expect(fps).toBeLessThanOrEqual(60);

      console.log(`  FPS: ${fps.toFixed(1)}`);
    });
  });

  // --------------------------------------------------------------------------
  // 5. First frame extraction
  // --------------------------------------------------------------------------

  describe('5. First Frame Extraction', () => {
    it('should extract first frame as PNG', async () => {
      const cmd = `ffmpeg -y -i "${OUTPUT_VIDEO}" -vframes 1 -q:v 2 "${FIRST_FRAME}"`;

      await execAsync(cmd, { timeout: 30_000 });
      expect(existsSync(FIRST_FRAME)).toBe(true);

      const metadata = await sharp(FIRST_FRAME).metadata();
      expect(metadata.width).toBe(1080);
      expect(metadata.height).toBe(1920);

      console.log(`  First frame: ${metadata.width}x${metadata.height} saved to ${FIRST_FRAME}`);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Metrics summary
  // --------------------------------------------------------------------------

  describe('6. Render Metrics', () => {
    it('should log final report', async () => {
      const stats = statSync(OUTPUT_VIDEO);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

      // Get duration
      let durationStr = '?';
      try {
        const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${OUTPUT_VIDEO}"`;
        const { stdout } = await execAsync(cmd);
        durationStr = `${parseFloat(stdout.trim()).toFixed(1)}s`;
      } catch { /* ignore */ }

      const kenBurns = storyboard.frames.filter(
        (f) => f.motionProfile === 'ken-burns',
      ).length;
      const panScan = storyboard.frames.filter(
        (f) => f.motionProfile === 'pan-scan',
      ).length;

      console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FULL-RENDER VALIDATION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pipeline:
  Frames:       ${storyboard.frames.length}
  Storyboard:   ${(storyboard.totalDurationMs / 1000).toFixed(1)}s
  Ken Burns:    ${kenBurns} frames
  Pan-Scan:     ${panScan} frames

Output:
  File:         ${OUTPUT_VIDEO}
  Size:         ${sizeMB}MB
  Duration:     ${durationStr}
  Codec:        H.264 (libx264)
  Resolution:   1080x1920 (9:16)
  First Frame:  ${FIRST_FRAME}

Status: RENDER VALIDATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);
    });
  });
});
