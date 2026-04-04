/**
 * Video Renderer — V1
 *
 * Transforma MediaPlan em vídeo real (.mp4) usando ffmpeg.
 *
 * Pipeline:
 * 1. Resolve assets (assetId → file path)
 * 2. Para cada cena: gera clip individual (imagem + texto + duração)
 * 3. Aplica transições (fade/cut) entre cenas
 * 4. Concatena todos os clips em vídeo final
 * 5. Exporta .mp4 com h264
 *
 * V1 Limitations:
 * - Apenas imagens estáticas por cena (sem motion)
 * - Transições: fade e cut apenas
 * - Sem trilha sonora
 * - Fonte do sistema para texto (sem custom fonts)
 */

import { mkdir, writeFile, stat, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

import type { MediaPlan, MediaScene, TextOverlay } from '../../domain/entities/media-plan.js';
import type { VideoRenderOptions, SceneClip, VideoRenderResult } from './types.js';
import {
  runFFmpeg,
  checkFFmpeg,
  buildImageToClipArgs,
  buildColorClipArgs,
  buildConcatArgs,
  buildXfadeArgs,
  type DrawTextSpec,
} from './ffmpeg.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FPS = 30;
const DEFAULT_SCENE_DURATION = 4; // seconds
const DEFAULT_FADE_DURATION = 0.5;
const MIN_SCENE_DURATION = 1;
const MAX_SCENE_DURATION = 30;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Renderiza um MediaPlan em arquivo de vídeo .mp4.
 */
export async function renderVideo(
  plan: MediaPlan,
  options: VideoRenderOptions,
): Promise<VideoRenderResult> {
  const warnings: string[] = [];
  const skippedScenes: number[] = [];

  // 1. Check ffmpeg
  const hasFFmpeg = await checkFFmpeg();
  if (!hasFFmpeg) {
    throw new Error('ffmpeg not found in PATH. Install ffmpeg to use video rendering.');
  }

  // 2. Setup directories
  await mkdir(options.outputDir, { recursive: true });
  await mkdir(options.tempDir, { recursive: true });

  const [width, height] = options.resolution;
  const fps = options.fps ?? DEFAULT_FPS;
  const fadeDuration = options.fadeDuration ?? DEFAULT_FADE_DURATION;

  // 3. Build scene clips
  console.log(`[VIDEO] Rendering ${plan.scenes.length} scenes at ${width}x${height}...`);
  const clips: SceneClip[] = [];

  for (const scene of plan.scenes) {
    const clipResult = await renderSceneClip(scene, {
      tempDir: options.tempDir,
      assetMap: options.assetMap,
      width,
      height,
      fps,
    });

    if (clipResult) {
      clips.push(clipResult);
      console.log(`  [SCENE ${scene.order}] ${clipResult.duration}s — ${scene.role} — ${clipResult.transition}`);
    } else {
      skippedScenes.push(scene.order);
      warnings.push(`Scene ${scene.order} (${scene.role}) skipped: no renderable content`);
      console.log(`  [SCENE ${scene.order}] SKIPPED — no content`);
    }
  }

  if (clips.length === 0) {
    throw new Error('No scenes could be rendered. Check asset availability.');
  }

  // 4. Concatenate clips with transitions
  console.log(`[VIDEO] Assembling ${clips.length} clips...`);
  const assembledPath = await assembleClips(clips, {
    tempDir: options.tempDir,
    fadeDuration,
    width,
    height,
  });

  // 5. Move to final output
  const slug = slugify(plan.title ?? plan.format);
  const filename = `${slug}--${plan.format}.mp4`;
  const outputPath = join(options.outputDir, filename);

  // Copy assembled file to output (rename if on same fs)
  const renameResult = await runFFmpeg([
    '-y', '-i', assembledPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ]);

  if (renameResult.exitCode !== 0) {
    throw new Error(`Failed to finalize video: ${renameResult.stderr.slice(-500)}`);
  }

  // 6. Get file stats
  const fileStat = await stat(outputPath);
  const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);

  // 7. Cleanup temp
  await cleanupTemp(options.tempDir);

  console.log(`[VIDEO] Done: ${filename} (${(fileStat.size / 1024).toFixed(1)}KB, ${totalDuration.toFixed(1)}s)`);

  return {
    outputPath,
    filename,
    sizeBytes: fileStat.size,
    durationSeconds: totalDuration,
    sceneCount: clips.length,
    resolution: [width, height],
    skippedScenes,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Scene clip rendering
// ---------------------------------------------------------------------------

async function renderSceneClip(
  scene: MediaScene,
  opts: {
    tempDir: string;
    assetMap: Map<string, string>;
    width: number;
    height: number;
    fps: number;
  },
): Promise<SceneClip | null> {
  const { tempDir, assetMap, width, height, fps } = opts;
  const clipPath = join(tempDir, `scene-${String(scene.order).padStart(3, '0')}.mp4`);
  const duration = clampDuration(scene.durationSeconds);

  // Resolve text overlays
  const textOverlays = mapTextOverlays(scene.textOverlays);

  // Try to find an asset image
  const assetId = scene.assetIds[0];
  const assetPath = assetId ? assetMap.get(assetId) : undefined;
  const hasAsset = assetPath && existsSync(assetPath);

  let args: string[];

  if (hasAsset) {
    // Image-based scene
    args = buildImageToClipArgs({
      imagePath: assetPath,
      outputPath: clipPath,
      duration,
      width,
      height,
      fps,
      textOverlays,
      backgroundColor: scene.branding.backgroundColor,
    });
  } else {
    // Color-background scene (no image available)
    if (textOverlays.length === 0) {
      // No image AND no text — scene has no visual content
      return null;
    }
    args = buildColorClipArgs({
      outputPath: clipPath,
      duration,
      width,
      height,
      fps,
      backgroundColor: normalizeColor(scene.branding.backgroundColor),
      textOverlays,
    });
  }

  const result = await runFFmpeg(args, 60_000);

  if (result.exitCode !== 0) {
    console.warn(`  [WARN] Scene ${scene.order} ffmpeg error: ${result.stderr.slice(-200)}`);
    return null;
  }

  return {
    index: scene.order,
    clipPath,
    duration,
    transition: scene.transition,
  };
}

// ---------------------------------------------------------------------------
// Clip assembly
// ---------------------------------------------------------------------------

async function assembleClips(
  clips: SceneClip[],
  opts: {
    tempDir: string;
    fadeDuration: number;
    width: number;
    height: number;
  },
): Promise<string> {
  if (clips.length === 1) {
    return clips[0].clipPath;
  }

  const { tempDir, fadeDuration } = opts;

  // Check if any clip uses fade transition
  const hasFades = clips.some((c, i) => i < clips.length - 1 && c.transition === 'fade');

  if (!hasFades) {
    // Simple concat (fastest, no re-encoding)
    return concatSimple(clips, tempDir);
  }

  // Progressive xfade assembly
  return assembleWithFades(clips, tempDir, fadeDuration, opts.width, opts.height);
}

/**
 * Simple concatenation using concat demuxer (no transitions, very fast).
 */
async function concatSimple(clips: SceneClip[], tempDir: string): Promise<string> {
  const listPath = join(tempDir, 'concat-list.txt');
  const outputPath = join(tempDir, 'assembled.mp4');

  // Write concat list file (use absolute paths for ffmpeg concat demuxer)
  const listContent = clips
    .map((c) => `file '${resolve(c.clipPath)}'`)
    .join('\n');
  await writeFile(listPath, listContent);

  const result = await runFFmpeg(buildConcatArgs({
    listFilePath: listPath,
    outputPath,
  }));

  if (result.exitCode !== 0) {
    throw new Error(`Concat failed: ${result.stderr.slice(-500)}`);
  }

  return outputPath;
}

/**
 * Progressive assembly with xfade transitions.
 * Processes clips pair by pair: (A+B) → AB, then (AB+C) → ABC, etc.
 */
async function assembleWithFades(
  clips: SceneClip[],
  tempDir: string,
  fadeDuration: number,
  width: number,
  height: number,
): Promise<string> {
  let currentPath = clips[0].clipPath;
  let currentDuration = clips[0].duration;

  for (let i = 1; i < clips.length; i++) {
    const nextClip = clips[i];
    const prevTransition = clips[i - 1].transition;
    const stepOutput = join(tempDir, `xfade-step-${i}.mp4`);

    if (prevTransition === 'fade' && fadeDuration > 0) {
      // Apply xfade
      const result = await runFFmpeg(buildXfadeArgs({
        clip1Path: currentPath,
        clip2Path: nextClip.clipPath,
        outputPath: stepOutput,
        fadeDuration: Math.min(fadeDuration, currentDuration * 0.5, nextClip.duration * 0.5),
        clip1Duration: currentDuration,
        width,
        height,
      }));

      if (result.exitCode !== 0) {
        // Fallback: simple concat if xfade fails
        console.warn(`  [WARN] xfade failed at step ${i}, falling back to cut`);
        await concatTwoClips(currentPath, nextClip.clipPath, stepOutput, tempDir);
        currentDuration = currentDuration + nextClip.duration;
      } else {
        // xfade reduces total duration by fadeDuration
        currentDuration = currentDuration + nextClip.duration - fadeDuration;
      }
    } else {
      // Simple cut
      await concatTwoClips(currentPath, nextClip.clipPath, stepOutput, tempDir);
      currentDuration = currentDuration + nextClip.duration;
    }

    currentPath = stepOutput;
  }

  return currentPath;
}

async function concatTwoClips(
  clip1: string,
  clip2: string,
  output: string,
  tempDir: string,
): Promise<void> {
  const listPath = join(tempDir, `concat-pair-${Date.now()}.txt`);
  await writeFile(listPath, `file '${resolve(clip1)}'\nfile '${resolve(clip2)}'`);

  const result = await runFFmpeg(buildConcatArgs({
    listFilePath: listPath,
    outputPath: output,
  }));

  if (result.exitCode !== 0) {
    throw new Error(`Concat pair failed: ${result.stderr.slice(-500)}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapTextOverlays(overlays: TextOverlay[]): DrawTextSpec[] {
  return overlays.map((o) => ({
    text: o.text,
    role: o.role,
    position: o.position,
    size: o.size,
  }));
}

function clampDuration(duration: number | null): number {
  if (duration == null) return DEFAULT_SCENE_DURATION;
  return Math.max(MIN_SCENE_DURATION, Math.min(MAX_SCENE_DURATION, duration));
}

function normalizeColor(color: string): string {
  // ffmpeg color format: remove # prefix if present
  if (color.startsWith('#')) {
    return `0x${color.slice(1)}`;
  }
  return color || '0x1a1a2e';
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

async function cleanupTemp(tempDir: string): Promise<void> {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
