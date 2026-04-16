/**
 * Visual Validation Test Suite
 *
 * Valida a pipeline de rendering visual do Sprint 2:
 *  - Safe crop 9:16 / 4:5 / 1:1 com POI awareness
 *  - FFmpeg filter chain syntax (zoompan, crop, scale+pad)
 *  - Storyboard JSON export para debug visual
 *  - Excessive crop detection
 *  - Ken Burns motion smoothness (zoompan params)
 *
 * Módulos puros — sem execução de FFmpeg real.
 */

import { describe, it, expect } from 'vitest';
import { v4 as uuid } from 'uuid';

import {
  VideoGeometry,
  type CropRect,
  type AspectRatioPreset,
} from '../../src/renderers/video/utils/crop-logic.js';
import { FFmpegStoryboardRenderer } from '../../src/renderers/video/ffmpeg-storyboard-renderer.js';
import { StoryboardBuilder, type StoryboardOutput } from '../../src/modules/media/storyboard-builder.js';
import { NarrativeEngine } from '../../src/modules/narrative/narrative-engine.js';
import { SceneComposerEnhanced } from '../../src/modules/media/scene-composer-enhanced.js';
import type { Asset } from '../../src/domain/entities/asset.js';
import type { CorrelationBlock } from '../../src/domain/entities/correlation.js';
import {
  CorrelationConfidence,
  CorrelationMethod,
  TextBlockType,
} from '../../src/domain/entities/correlation.js';
import { SourceType, AssetOrigin } from '../../src/domain/value-objects/index.js';
import type { Dimensions } from '../../src/domain/value-objects/index.js';

// ==========================================================================
// 1. Safe Crop (VideoGeometry)
// ==========================================================================

describe('Visual Validation — Safe Crop', () => {
  describe('9:16 crop (Reels/Stories)', () => {
    it('should crop horizontal for wide landscape image', () => {
      const source: Dimensions = { width: 2400, height: 1600 };
      const crop = VideoGeometry.calculateSafeCrop(source, '9:16');

      // 9:16 ratio from 1600 height → width = 1600 * 9/16 = 900
      expect(crop.width).toBe(900);
      expect(crop.height).toBe(1600);
      expect(crop.method).toBe('crop-horizontal');
      // Default POI center → crop centered
      expect(crop.x).toBe(750); // (2400 - 900) / 2
      expect(crop.y).toBe(0);
    });

    it('should respect POI on left side', () => {
      const source: Dimensions = { width: 2400, height: 1600 };
      const crop = VideoGeometry.calculateSafeCrop(source, '9:16', { x: 0.2, y: 0.5 });

      // POI at x=0.2 → desired x = 2400*0.2 - 900/2 = 30
      expect(crop.x).toBe(30);
      expect(crop.method).toBe('crop-horizontal');
      expect(crop.appliedPoi.x).toBe(0.2);
    });

    it('should clamp POI to image bounds', () => {
      const source: Dimensions = { width: 2400, height: 1600 };
      const crop = VideoGeometry.calculateSafeCrop(source, '9:16', { x: 0.01, y: 0.5 });

      // POI at x=0.01 → desired x = 2400*0.01 - 450 = -426 → clamped to 0
      expect(crop.x).toBe(0);
      expect(crop.width).toBe(900);
    });

    it('should clamp POI to right bound', () => {
      const source: Dimensions = { width: 2400, height: 1600 };
      const crop = VideoGeometry.calculateSafeCrop(source, '9:16', { x: 0.99, y: 0.5 });

      // POI at x=0.99 → desired x = 2400*0.99 - 450 = 1926 → clamped to maxX=1500
      expect(crop.x).toBe(1500);
      expect(crop.width).toBe(900);
    });

    it('should crop vertical for tall portrait image', () => {
      const source: Dimensions = { width: 800, height: 2000 };
      const crop = VideoGeometry.calculateSafeCrop(source, '9:16');

      // 9:16 from 800 width → height = 800 / (9/16) = 1422.2
      expect(crop.width).toBe(800);
      expect(crop.height).toBe(1422);
      expect(crop.method).toBe('crop-vertical');
    });

    it('should return no-crop when source already matches 9:16', () => {
      const source: Dimensions = { width: 1080, height: 1920 };
      const crop = VideoGeometry.calculateSafeCrop(source, '9:16');

      expect(crop.x).toBe(0);
      expect(crop.y).toBe(0);
      expect(crop.width).toBe(1080);
      expect(crop.height).toBe(1920);
      expect(crop.method).toBe('no-crop');
    });
  });

  describe('Other aspect ratios', () => {
    it('should handle 4:5 (Instagram feed)', () => {
      const source: Dimensions = { width: 2400, height: 1600 };
      const crop = VideoGeometry.calculateSafeCrop(source, '4:5');

      // 4:5 from 1600 height → width = 1600 * 4/5 = 1280
      expect(crop.width).toBe(1280);
      expect(crop.height).toBe(1600);
      expect(crop.method).toBe('crop-horizontal');
    });

    it('should handle 1:1 (square)', () => {
      const source: Dimensions = { width: 2400, height: 1600 };
      const crop = VideoGeometry.calculateSafeCrop(source, '1:1');

      expect(crop.width).toBe(1600);
      expect(crop.height).toBe(1600);
      expect(crop.method).toBe('crop-horizontal');
    });

    it('should handle 16:9 (YouTube)', () => {
      const source: Dimensions = { width: 1200, height: 1200 };
      const crop = VideoGeometry.calculateSafeCrop(source, '16:9');

      // 16:9 from 1200 width → height = 1200 / (16/9) = 675
      expect(crop.width).toBe(1200);
      expect(crop.height).toBe(675);
      expect(crop.method).toBe('crop-vertical');
    });
  });

  describe('Excessive crop detection', () => {
    it('should detect when crop discards > 30% of image', () => {
      const source: Dimensions = { width: 3000, height: 1000 };
      const crop = VideoGeometry.calculateSafeCrop(source, '9:16');

      // 9:16 from 1000 height → width = 562 → keeps 562*1000/3M = 18.7% → discards 81%
      expect(VideoGeometry.isCropExcessive(source, crop)).toBe(true);
    });

    it('should not flag moderate crop as excessive', () => {
      const source: Dimensions = { width: 1200, height: 1600 };
      const crop = VideoGeometry.calculateSafeCrop(source, '9:16');

      // 9:16 from 1600 → width = 900 → keeps 900*1600/1.92M = 75%
      expect(VideoGeometry.isCropExcessive(source, crop)).toBe(false);
    });

    it('should respect custom threshold', () => {
      const source: Dimensions = { width: 2000, height: 1000 };
      const crop = VideoGeometry.calculateSafeCrop(source, '9:16');

      // Keeps 562*1000/2M = 28.1% → discards 71.9%
      expect(VideoGeometry.isCropExcessive(source, crop, 0.5)).toBe(true);  // > 50% lost
      expect(VideoGeometry.isCropExcessive(source, crop, 0.8)).toBe(false); // < 80% threshold
    });
  });
});

// ==========================================================================
// 2. FFmpeg Filter Chain Validation
// ==========================================================================

describe('Visual Validation — FFmpeg Filter Chain', () => {
  // Build a mini storyboard for FFmpeg tests
  const IDENTITY_CTM = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

  const assets: Asset[] = [
    {
      id: 'hero-1', filePath: 'assets/hero-1.jpg', dimensions: { width: 2400, height: 1600 },
      page: 1, format: 'jpg', sizeBytes: 200000, origin: AssetOrigin.PDF_EXTRACTED,
      isOriginal: true, classification: SourceType.HERO,
      geometry: { page: 1, x: 0, y: 0, width: 595, height: 400, zIndex: 0, ctm: IDENTITY_CTM },
      position: { x: 0.6, y: 0.3 },
    },
    {
      id: 'lifestyle-1', filePath: 'assets/lifestyle-1.jpg', dimensions: { width: 1800, height: 900 },
      page: 2, format: 'jpg', sizeBytes: 150000, origin: AssetOrigin.PDF_EXTRACTED,
      isOriginal: true, classification: SourceType.LIFESTYLE,
      geometry: { page: 2, x: 50, y: 100, width: 500, height: 250, zIndex: 0, ctm: IDENTITY_CTM },
    },
    {
      id: 'static-1', filePath: 'assets/static-1.jpg', dimensions: { width: 1000, height: 1000 },
      page: 3, format: 'jpg', sizeBytes: 100000, origin: AssetOrigin.PDF_EXTRACTED,
      isOriginal: true, classification: SourceType.PLANTA,
      geometry: { page: 3, x: 0, y: 0, width: 500, height: 500, zIndex: 0, ctm: IDENTITY_CTM },
    },
  ];

  const blocks: CorrelationBlock[] = [
    {
      id: uuid(), page: 1, assetIds: ['hero-1'],
      textBlocks: [{ content: 'Fachada moderna com design contemporâneo', page: 1, blockType: TextBlockType.PARAGRAPH, keywords: ['fachada'] }],
      headline: 'Fachada', summary: 'Fachada moderna com design contemporâneo',
      confidence: CorrelationConfidence.HIGH, methods: [CorrelationMethod.PAGE_PROXIMITY],
      tags: [], priority: 1,
    },
    {
      id: uuid(), page: 2, assetIds: ['lifestyle-1'],
      textBlocks: [{ content: 'Piscina aquecida com borda infinita', page: 2, blockType: TextBlockType.PARAGRAPH, keywords: ['piscina'] }],
      headline: 'Piscina', summary: 'Piscina aquecida com borda infinita',
      confidence: CorrelationConfidence.MEDIUM, methods: [CorrelationMethod.PAGE_PROXIMITY],
      tags: [], priority: 3,
    },
    {
      id: uuid(), page: 3, assetIds: ['static-1'],
      textBlocks: [{ content: 'Planta tipo com 3 dormitórios', page: 3, blockType: TextBlockType.PARAGRAPH, keywords: ['planta'] }],
      headline: 'Planta', summary: 'Planta tipo com 3 dormitórios',
      confidence: CorrelationConfidence.MEDIUM, methods: [CorrelationMethod.PAGE_PROXIMITY],
      tags: [], priority: 5,
    },
  ];

  let storyboard: StoryboardOutput;

  it('should build storyboard from pipeline', () => {
    const assetMap = new Map(assets.map((a) => [a.id, a]));
    const scenes = new SceneComposerEnhanced().composeScenes(blocks, assetMap);
    const narrative = new NarrativeEngine().buildStoryboard(scenes);
    const dims = new Map<string, Dimensions>(assets.map((a) => [a.id, a.dimensions]));
    storyboard = new StoryboardBuilder().buildStoryboard('visual-test', narrative, dims);

    expect(storyboard.frames.length).toBe(3);
  });

  it('should generate syntactically valid filter_complex', () => {
    const renderer = new FFmpegStoryboardRenderer();
    const cmd = renderer.generateCommand(storyboard, 'output.mp4');
    const filterIdx = cmd.indexOf('-filter_complex');
    const filterComplex = cmd[filterIdx + 1];

    // Each frame gets [N:v]...filters...[outN] separated by ;
    // Plus one concat segment at the end
    const segments = filterComplex.split(';');
    expect(segments.length).toBe(storyboard.frames.length + 1);

    // Frame segments (exclude last concat segment)
    for (let i = 0; i < storyboard.frames.length; i++) {
      const seg = segments[i];
      // Must start with [N:v] input reference
      expect(seg).toMatch(new RegExp(`^\\[${i}:v\\]`));
      // Must end with [outN] label
      expect(seg).toMatch(new RegExp(`\\[out${i}\\]$`));
      // Must contain crop=
      expect(seg).toContain('crop=');
      // Must target 1080x1920 output (via scale+pad for static, or zoompan s= for motion)
      expect(seg).toMatch(/1080.*1920/);
    }

    // Last segment is the concat filter
    const concatSeg = segments[segments.length - 1];
    expect(concatSeg).toContain('concat=');
    expect(concatSeg).toContain('[final]');
  });

  it('should include zoompan only for non-static frames', () => {
    const renderer = new FFmpegStoryboardRenderer();
    const cmd = renderer.generateCommand(storyboard, 'output.mp4');
    const filterComplex = cmd[cmd.indexOf('-filter_complex') + 1];
    const segments = filterComplex.split(';');

    for (let i = 0; i < storyboard.frames.length; i++) {
      const frame = storyboard.frames[i];
      const seg = segments[i];

      if (frame.motionProfile === 'static') {
        expect(seg).not.toContain('zoompan');
      } else {
        expect(seg).toContain('zoompan');
      }
    }
  });

  it('should have correct Ken Burns zoompan params for hero frames', () => {
    const renderer = new FFmpegStoryboardRenderer();
    const cmd = renderer.generateCommand(storyboard, 'output.mp4');
    const filterComplex = cmd[cmd.indexOf('-filter_complex') + 1];
    const segments = filterComplex.split(';');

    for (let i = 0; i < storyboard.frames.length; i++) {
      const frame = storyboard.frames[i];
      if (frame.motionProfile !== 'ken-burns') continue;

      const seg = segments[i];
      // Ken Burns should zoom from 1.0 to 1.5
      expect(seg).toContain("z='min(zoom+0.002,1.5)'");
      // Should focus on POI
      expect(seg).toContain(`x='iw*${frame.poiX.toFixed(2)}`);
      expect(seg).toContain(`y='ih*${frame.poiY.toFixed(2)}`);
      // Duration should match frame
      const durationFrames = Math.round((frame.durationMs / 1000) * 30);
      expect(seg).toContain(`d=${durationFrames}`);
    }
  });

  it('should have pan-scan horizontal movement params', () => {
    const renderer = new FFmpegStoryboardRenderer();
    const cmd = renderer.generateCommand(storyboard, 'output.mp4');
    const filterComplex = cmd[cmd.indexOf('-filter_complex') + 1];
    const segments = filterComplex.split(';');

    for (let i = 0; i < storyboard.frames.length; i++) {
      const frame = storyboard.frames[i];
      if (frame.motionProfile !== 'pan-scan') continue;

      const seg = segments[i];
      // Pan-scan uses fixed 1.3x zoom
      expect(seg).toContain('z=1.3');
      // Horizontal sweep from 10% to 90% of width
      expect(seg).toContain("x='iw*0.1+iw*0.8*on/");
    }
  });

  it('should generate correct encoder params', () => {
    const renderer = new FFmpegStoryboardRenderer();
    const cmd = renderer.generateCommand(storyboard, 'output/reel.mp4');

    expect(cmd).toContain('-c:v');
    expect(cmd).toContain('libx264');
    expect(cmd).toContain('-preset');
    expect(cmd).toContain('medium');
    expect(cmd).toContain('-crf');
    expect(cmd).toContain('18');
    expect(cmd).toContain('-pix_fmt');
    expect(cmd).toContain('yuv420p');
    expect(cmd[cmd.length - 1]).toBe('output/reel.mp4');
  });

  it('should produce valid crop dimensions within source bounds', () => {
    for (const frame of storyboard.frames) {
      const asset = assets.find((a) => a.id === frame.assetId)!;
      const { x, y, width, height } = frame.cropGeometry;

      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(asset.dimensions.width);
      expect(y + height).toBeLessThanOrEqual(asset.dimensions.height);

      // Crop should approximate 9:16 ratio
      const cropRatio = width / height;
      expect(cropRatio).toBeCloseTo(9 / 16, 1);
    }
  });
});

// ==========================================================================
// 3. Storyboard JSON Export (for visual debugging)
// ==========================================================================

describe('Visual Validation — Storyboard JSON Export', () => {
  it('should export full storyboard as inspectable JSON', () => {
    const IDENTITY_CTM = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const assets: Asset[] = [
      {
        id: 'export-hero', filePath: 'assets/hero.jpg', dimensions: { width: 2400, height: 1600 },
        page: 1, format: 'jpg', sizeBytes: 200000, origin: AssetOrigin.PDF_EXTRACTED,
        isOriginal: true, classification: SourceType.HERO,
        geometry: { page: 1, x: 0, y: 0, width: 595, height: 400, zIndex: 0, ctm: IDENTITY_CTM },
        position: { x: 0.5, y: 0.3 },
      },
      {
        id: 'export-cta', filePath: 'assets/cta.jpg', dimensions: { width: 800, height: 600 },
        page: 2, format: 'jpg', sizeBytes: 80000, origin: AssetOrigin.PDF_EXTRACTED,
        isOriginal: true, classification: SourceType.CTA,
        geometry: { page: 2, x: 100, y: 100, width: 400, height: 300, zIndex: 0, ctm: IDENTITY_CTM },
      },
    ];

    const blocks: CorrelationBlock[] = [
      {
        id: uuid(), page: 1, assetIds: ['export-hero'],
        textBlocks: [{ content: 'Vista panorâmica do empreendimento', page: 1, blockType: TextBlockType.HEADLINE, keywords: ['vista'] }],
        summary: 'Vista panorâmica', confidence: CorrelationConfidence.HIGH,
        methods: [CorrelationMethod.PAGE_PROXIMITY], tags: [], priority: 1,
      },
      {
        id: uuid(), page: 2, assetIds: ['export-cta'],
        textBlocks: [{ content: 'Agende sua visita hoje mesmo', page: 2, blockType: TextBlockType.CTA, keywords: ['agende'] }],
        summary: 'Agende sua visita', confidence: CorrelationConfidence.LOW,
        methods: [CorrelationMethod.PAGE_PROXIMITY], tags: [], priority: 5,
      },
    ];

    const assetMap = new Map(assets.map((a) => [a.id, a]));
    const scenes = new SceneComposerEnhanced().composeScenes(blocks, assetMap);
    const narrative = new NarrativeEngine().buildStoryboard(scenes);
    const dims = new Map<string, Dimensions>(assets.map((a) => [a.id, a.dimensions]));
    const storyboard = new StoryboardBuilder().buildStoryboard('export-test', narrative, dims);

    // Verify JSON structure
    const json = JSON.parse(JSON.stringify(storyboard));

    expect(json.jobId).toBe('export-test');
    expect(json.metadata.format).toBe('9:16');
    expect(json.metadata.resolution).toBe('1080x1920');
    expect(json.metadata.fps).toBe(30);
    expect(json.frames.length).toBe(2);

    // Hook frame should be first (highest confidence)
    expect(json.frames[0].durationMs).toBe(4000); // hook = 4s

    // Each frame must have complete structure
    for (const frame of json.frames) {
      expect(frame).toHaveProperty('id');
      expect(frame).toHaveProperty('assetId');
      expect(frame).toHaveProperty('assetPath');
      expect(frame).toHaveProperty('textContent');
      expect(frame).toHaveProperty('durationMs');
      expect(frame).toHaveProperty('cropGeometry');
      expect(frame).toHaveProperty('motionProfile');
      expect(frame).toHaveProperty('poiX');
      expect(frame).toHaveProperty('poiY');
      expect(frame.cropGeometry).toHaveProperty('x');
      expect(frame.cropGeometry).toHaveProperty('y');
      expect(frame.cropGeometry).toHaveProperty('width');
      expect(frame.cropGeometry).toHaveProperty('height');
      expect(frame.cropGeometry).toHaveProperty('method');
    }

    // Log for visual inspection
    const renderer = new FFmpegStoryboardRenderer();
    const ffmpegCmd = renderer.generateCommand(storyboard, 'mansao-othon.mp4');

    console.log(`
┌─ STORYBOARD EXPORT ──────────────────────────────
│ Job: ${json.jobId}
│ Frames: ${json.frames.length}
│ Duration: ${(json.totalDurationMs / 1000).toFixed(1)}s
│ Format: ${json.metadata.format} @ ${json.metadata.resolution}
│`);
    for (const frame of json.frames) {
      console.log(
        `│ Frame #${frame.sequenceOrder}: ${frame.assetId}` +
          `\n│   crop=${frame.cropGeometry.width}x${frame.cropGeometry.height}+${frame.cropGeometry.x}+${frame.cropGeometry.y} (${frame.cropGeometry.method})` +
          `\n│   motion=${frame.motionProfile} poi=(${frame.poiX.toFixed(2)},${frame.poiY.toFixed(2)})` +
          `\n│   duration=${frame.durationMs}ms text="${frame.textContent.slice(0, 50)}..."`,
      );
    }
    console.log(`│`);
    console.log(`│ FFmpeg: ${ffmpegCmd.length} args`);
    console.log(`│ Command: ${ffmpegCmd.slice(0, 4).join(' ')} ... ${ffmpegCmd.slice(-1)}`);
    console.log(`└──────────────────────────────────────────────────`);
  });
});
