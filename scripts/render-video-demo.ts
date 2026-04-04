/**
 * Video Render Demo
 *
 * Demonstrates the V1 video renderer by:
 * 1. Running the existing pipeline to generate MediaPlans
 * 2. Generating sample asset images (solid colors as placeholders)
 * 3. Rendering the first MediaPlan as an actual .mp4 video
 *
 * Usage: npx tsx scripts/render-video-demo.ts
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSampleContext } from './sample-fixture.js';
import { renderVideo, checkFFmpeg } from '../src/renderers/video/index.js';
import type { VideoRenderOptions } from '../src/renderers/video/index.js';
import type { MediaPlan } from '../src/domain/entities/media-plan.js';

// Import modules to generate plans
import { CorrelationModule } from '../src/modules/correlation/index.js';
import { SourceIntelligenceModule } from '../src/modules/source-intelligence/index.js';
import { NarrativeModule } from '../src/modules/narrative/index.js';
import { OutputSelectionModule } from '../src/modules/output-selection/index.js';
import { MediaGenerationModule } from '../src/modules/media/index.js';
import { PersonalizationModule } from '../src/modules/personalization/index.js';
import { EMPTY_BRANDING } from '../src/domain/entities/branding.js';
import type { ProcessingContext } from '../src/core/context.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OUTPUT_DIR = 'storage/video-demo';
const TEMP_DIR = 'storage/video-demo/.tmp';
const ASSETS_DIR = 'storage/video-demo/assets';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('═'.repeat(70));
  console.log('  BOOKAGENT — VIDEO RENDER DEMO (V1)');
  console.log('═'.repeat(70));
  console.log();

  // 1. Check ffmpeg
  console.log('[CHECK] Verifying ffmpeg...');
  const hasFFmpeg = await checkFFmpeg();
  if (!hasFFmpeg) {
    console.error('[FATAL] ffmpeg not found. Install ffmpeg to continue.');
    process.exit(1);
  }
  console.log('[CHECK] ffmpeg OK');

  // 2. Run pipeline to generate MediaPlans
  console.log('\n[PIPELINE] Generating MediaPlans...');
  const ctx = await runPipeline();
  const mediaPlans = ctx.mediaPlans ?? [];
  console.log(`[PIPELINE] ${mediaPlans.length} MediaPlans generated`);

  if (mediaPlans.length === 0) {
    console.error('[FATAL] No MediaPlans generated');
    process.exit(1);
  }

  // 3. Generate placeholder asset images
  console.log('\n[ASSETS] Generating placeholder images...');
  const assetMap = await generatePlaceholderAssets(mediaPlans);
  console.log(`[ASSETS] ${assetMap.size} placeholder images created`);

  // 4. Render first MediaPlan as video
  const plan = mediaPlans[0];
  console.log(`\n[RENDER] Rendering "${plan.title}" [${plan.format}]...`);
  console.log(`  Scenes: ${plan.scenes.length}`);
  console.log(`  Duration: ${plan.totalDurationSeconds ?? '?'}s`);
  console.log(`  Resolution: ${plan.resolution[0]}x${plan.resolution[1]}`);
  console.log();

  const startTime = Date.now();

  const options: VideoRenderOptions = {
    outputDir: OUTPUT_DIR,
    tempDir: TEMP_DIR,
    assetMap,
    resolution: plan.resolution,
    fps: 30,
    fadeDuration: 0.5,
  };

  const result = await renderVideo(plan, options);
  const elapsed = Date.now() - startTime;

  // 5. Report
  console.log('\n' + '═'.repeat(70));
  console.log('  VIDEO RENDER COMPLETE');
  console.log('═'.repeat(70));
  console.log(`  File: ${result.outputPath}`);
  console.log(`  Size: ${(result.sizeBytes / 1024).toFixed(1)} KB`);
  console.log(`  Duration: ${result.durationSeconds.toFixed(1)}s`);
  console.log(`  Resolution: ${result.resolution[0]}x${result.resolution[1]}`);
  console.log(`  Scenes rendered: ${result.sceneCount}`);
  console.log(`  Scenes skipped: ${result.skippedScenes.length}`);
  console.log(`  Render time: ${elapsed}ms`);
  if (result.warnings.length > 0) {
    console.log(`  Warnings:`);
    for (const w of result.warnings) console.log(`    - ${w}`);
  }
  console.log('═'.repeat(70));

  // 6. Render additional plans if time allows
  if (mediaPlans.length > 1) {
    console.log(`\n[BONUS] Rendering ${mediaPlans.length - 1} additional plans...`);
    for (let i = 1; i < mediaPlans.length; i++) {
      const p = mediaPlans[i];
      try {
        const r = await renderVideo(p, {
          ...options,
          tempDir: `${TEMP_DIR}-${i}`,
        });
        console.log(`  [${p.format}] ${r.filename} — ${r.durationSeconds.toFixed(1)}s, ${(r.sizeBytes / 1024).toFixed(1)}KB`);
      } catch (err) {
        console.log(`  [${p.format}] FAILED: ${(err as Error).message}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pipeline execution (same as sample-run but minimal)
// ---------------------------------------------------------------------------

async function runPipeline(): Promise<ProcessingContext> {
  let ctx = createSampleContext();

  // Stub branding
  ctx = { ...ctx, branding: EMPTY_BRANDING };

  // Run modules sequentially
  const modules = [
    new CorrelationModule(),
    new SourceIntelligenceModule(),
    new NarrativeModule(),
    new OutputSelectionModule(),
    new MediaGenerationModule(),
    new PersonalizationModule(),
  ];

  for (const mod of modules) {
    ctx = await mod.run(ctx);
  }

  return ctx;
}

// ---------------------------------------------------------------------------
// Placeholder asset generation
// ---------------------------------------------------------------------------

/**
 * Generates solid-color PNG images as placeholders for asset IDs.
 * In production, these would be real extracted images from the PDF.
 */
async function generatePlaceholderAssets(plans: MediaPlan[]): Promise<Map<string, string>> {
  await mkdir(ASSETS_DIR, { recursive: true });

  const assetMap = new Map<string, string>();
  const allAssetIds = new Set<string>();

  for (const plan of plans) {
    for (const scene of plan.scenes) {
      for (const id of scene.assetIds) {
        allAssetIds.add(id);
      }
    }
  }

  // Generate a simple PPM image for each asset (ffmpeg reads PPM natively)
  const colors = [
    [45, 90, 61],    // dark green
    [26, 58, 42],    // forest
    [200, 169, 110], // gold
    [70, 130, 90],   // green
    [40, 60, 80],    // dark blue
    [180, 140, 100], // warm tan
    [60, 100, 120],  // teal
    [120, 80, 60],   // brown
    [90, 130, 150],  // steel blue
    [50, 80, 50],    // olive
    [160, 120, 80],  // copper
    [80, 60, 100],   // purple
    [100, 140, 100], // sage
  ];

  let colorIdx = 0;
  for (const assetId of allAssetIds) {
    const [r, g, b] = colors[colorIdx % colors.length];
    const filePath = join(ASSETS_DIR, `${assetId}.ppm`);

    // Generate 1080x1920 PPM image (simple binary format)
    const width = 1080;
    const height = 1920;
    const header = `P6\n${width} ${height}\n255\n`;
    const headerBuf = Buffer.from(header, 'ascii');
    const pixelData = Buffer.alloc(width * height * 3);

    for (let i = 0; i < width * height; i++) {
      // Add subtle gradient for visual interest
      const row = Math.floor(i / width);
      const gradientFactor = 1 - (row / height) * 0.3;
      pixelData[i * 3] = Math.round(r * gradientFactor);
      pixelData[i * 3 + 1] = Math.round(g * gradientFactor);
      pixelData[i * 3 + 2] = Math.round(b * gradientFactor);
    }

    await writeFile(filePath, Buffer.concat([headerBuf, pixelData]));
    assetMap.set(assetId, filePath);
    colorIdx++;
  }

  return assetMap;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
