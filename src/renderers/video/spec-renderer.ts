/**
 * Spec Renderer — BookAgent Intelligence Engine
 *
 * Renders a video from a RenderSpec JSON — the ONLY official contract
 * between the content pipeline and the video rendering engine.
 *
 * This replaces the previous direct MediaPlan → renderVideo() coupling.
 *
 * Architecture:
 *   Pipeline (stages 1-15) → RenderSpec JSON artifact
 *   Async job (post-approval) → specRenderer.renderFromSpec() → .mp4
 *
 * The renderer does NOT interpret domain concepts (narrative beats, sources,
 * branding profiles). It only reads the flattened RenderSpec format.
 *
 * Parte 59.1: Fechamento do Pipeline de Vídeo
 */

import { mkdir, stat, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

import type { VideoRenderResult } from './types.js';
import {
  runFFmpeg,
  checkFFmpeg,
  buildImageToClipArgs,
  buildColorClipArgs,
  buildConcatArgs,
  buildXfadeArgs,
  buildAudioMixArgs,
  buildNarrationOverlayArgs,
  buildSubtitleBurnInArgs,
  buildSubtitleDrawTextArgs,
  type DrawTextSpec,
} from './ffmpeg.js';
import { logger } from '../../utils/logger.js';

// Re-export shared types for backwards compatibility
import type { RenderSpec, RenderSceneSpec } from '../../types/render-spec.js';
export type { RenderSpec, RenderSceneSpec };

export interface SpecRenderOptions {
  outputDir: string;
  tempDir: string;
  /** assetId → local file path */
  assetMap: Map<string, string>;
  fps?: number;
  fadeDuration?: number;
  /** Global timeout for entire render in ms (default: 5 min) */
  globalTimeoutMs?: number;
  /** Per-scene timeout in ms (default: 60s) */
  sceneTimeoutMs?: number;
  /** Path to background music file (Parte 62) */
  musicTrackPath?: string;
  /** Path to narration audio file (Parte 62) */
  narrationPath?: string;
  /** Path to ASS subtitle file for burn-in (Parte 64) */
  subtitleAssPath?: string;
  /** FFmpeg drawtext filter string for burn-in fallback (Parte 64) */
  subtitleDrawTextFilter?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_FPS = 30;
const DEFAULT_SCENE_DURATION = 4;
const DEFAULT_FADE_DURATION = 0.5;
const MIN_SCENE_DURATION = 1;
const MAX_SCENE_DURATION = 30;
const DEFAULT_GLOBAL_TIMEOUT = 5 * 60_000;   // 5 minutes
const DEFAULT_SCENE_TIMEOUT = 60_000;          // 60 seconds

// ============================================================================
// Public API
// ============================================================================

/**
 * Renders a video from a RenderSpec JSON.
 *
 * This is the ONLY entry point for video rendering.
 * It does NOT accept MediaPlan — only RenderSpec.
 */
// ---------------------------------------------------------------------------
// Provider selection — FFmpeg local (default) ou Shotstack cloud
// ---------------------------------------------------------------------------
// Controlado por VIDEO_RENDERER env var:
//   "ffmpeg" (default)  → render local no container (zero latência externa)
//   "shotstack"         → Shotstack cloud (requer SHOTSTACK_API_KEY)
//
// Decisão estratégica: mover pra Cloud Run com ffmpeg nativo elimina o
// round-trip externo (~30-90s no Shotstack) e usa recursos do container.
// Shotstack continua disponível como fallback/alternative.
// ---------------------------------------------------------------------------
import { isShotstackConfigured, renderWithShotstack } from './shotstack-adapter.js';

export async function renderFromSpec(
  spec: RenderSpec,
  options: SpecRenderOptions,
): Promise<VideoRenderResult> {
  const providerPref = (process.env.VIDEO_RENDERER ?? 'ffmpeg').toLowerCase();

  // Shotstack only when explicitly requested AND configured
  if (providerPref === 'shotstack' && isShotstackConfigured()) {
    logger.info('[renderFromSpec] Provider: Shotstack cloud (VIDEO_RENDERER=shotstack)');
    return renderWithShotstack(spec, options);
  }

  // Default: FFmpeg local
  logger.info(`[renderFromSpec] Provider: FFmpeg local (VIDEO_RENDERER=${providerPref})`);

  const startTime = Date.now();
  const globalTimeout = options.globalTimeoutMs ?? DEFAULT_GLOBAL_TIMEOUT;
  const sceneTimeout = options.sceneTimeoutMs ?? DEFAULT_SCENE_TIMEOUT;
  const warnings: string[] = [];
  const skippedScenes: number[] = [];

  // Check ffmpeg
  const hasFFmpeg = await checkFFmpeg();
  if (!hasFFmpeg) {
    throw new Error('ffmpeg not found in PATH — configure SHOTSTACK_API_KEY para usar cloud render.');
  }

  // Setup directories
  await mkdir(options.outputDir, { recursive: true });
  await mkdir(options.tempDir, { recursive: true });

  const [width, height] = spec.resolution;
  const fps = options.fps ?? DEFAULT_FPS;
  // Parte 63: transition profile overrides fade duration
  const fadeDuration = spec.transitionProfile?.transitionDuration
    ?? options.fadeDuration
    ?? DEFAULT_FADE_DURATION;

  logger.info(`[SpecRenderer] Rendering ${spec.scenes.length} scenes at ${width}x${height} (${spec.format})`);

  // Build scene clips
  const clips: Array<{ index: number; clipPath: string; duration: number; transition: string }> = [];

  for (const scene of spec.scenes) {
    // Check global timeout
    if (Date.now() - startTime > globalTimeout) {
      warnings.push(`Global timeout (${globalTimeout}ms) reached at scene ${scene.order}`);
      logger.warn(`[SpecRenderer] Global timeout reached at scene ${scene.order}`);
      break;
    }

    // Parte 63: Preset motion profile overrides default scene duration
    const presetSceneDuration = spec.motionProfile?.defaultSceneDuration ?? null;

    const clip = await renderSceneFromSpec(scene, {
      tempDir: options.tempDir,
      assetMap: options.assetMap,
      width,
      height,
      fps,
      timeoutMs: sceneTimeout,
      presetSceneDuration,
    });

    if (clip) {
      clips.push(clip);
      logger.debug(`[SpecRenderer] Scene ${scene.order}: ${clip.duration}s — ${scene.role} — ${scene.layout}`);
    } else {
      skippedScenes.push(scene.order);
      warnings.push(`Scene ${scene.order} (${scene.role}) skipped: no renderable content`);
    }
  }

  if (clips.length === 0) {
    throw new Error('No scenes could be rendered. Check asset availability and RenderSpec content.');
  }

  // Assemble clips
  logger.info(`[SpecRenderer] Assembling ${clips.length} clips...`);
  const assembledPath = await assembleClips(clips, {
    tempDir: options.tempDir,
    fadeDuration,
    width,
    height,
  });

  // ---------- Audio mixing (Parte 62) ----------
  const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);
  let videoWithAudioPath = assembledPath;

  const hasMusic = !!options.musicTrackPath && existsSync(options.musicTrackPath);
  const hasNarration = !!options.narrationPath && existsSync(options.narrationPath);

  if (hasMusic || hasNarration) {
    const mixedPath = join(options.tempDir, `mixed-${Date.now()}.mp4`);

    if (hasMusic) {
      // Mix music (+ optional narration) into video
      const mixArgs = buildAudioMixArgs({
        videoPath: assembledPath,
        musicPath: options.musicTrackPath!,
        narrationPath: hasNarration ? options.narrationPath : undefined,
        outputPath: mixedPath,
        musicVolume: spec.mixConfig?.musicVolume ?? 0.15,
        narrationVolume: spec.mixConfig?.narrationVolume ?? 1.0,
        duckingDb: spec.mixConfig?.duckingDb ?? -10,
        fadeInSeconds: spec.mixConfig?.fadeInSeconds ?? 2,
        fadeOutSeconds: spec.mixConfig?.fadeOutSeconds ?? 3,
        videoDurationSeconds: totalDuration,
      });

      const mixResult = await runFFmpeg(mixArgs, 120_000);
      if (mixResult.exitCode === 0) {
        videoWithAudioPath = mixedPath;
        logger.info('[SpecRenderer] Background music mixed successfully');
      } else {
        warnings.push(`Music mix failed: ${mixResult.stderr.slice(-200)}`);
        logger.warn(`[SpecRenderer] Music mix failed — proceeding without music`);
      }
    } else if (hasNarration) {
      // Narration only (no music)
      const narrArgs = buildNarrationOverlayArgs({
        videoPath: assembledPath,
        narrationPath: options.narrationPath!,
        outputPath: mixedPath,
      });

      const narrResult = await runFFmpeg(narrArgs, 120_000);
      if (narrResult.exitCode === 0) {
        videoWithAudioPath = mixedPath;
        logger.info('[SpecRenderer] Narration overlaid successfully');
      } else {
        warnings.push(`Narration overlay failed: ${narrResult.stderr.slice(-200)}`);
        logger.warn('[SpecRenderer] Narration overlay failed — proceeding without audio');
      }
    }
  }

  // ---------- Subtitle burn-in (Parte 64) ----------
  let videoWithSubsPath = videoWithAudioPath;

  const hasAssSubs = !!options.subtitleAssPath && existsSync(options.subtitleAssPath);
  const hasDrawTextSubs = !!options.subtitleDrawTextFilter;

  if (hasAssSubs) {
    const captionedPath = join(options.tempDir, `captioned-${Date.now()}.mp4`);
    const subsResult = await runFFmpeg(
      buildSubtitleBurnInArgs({
        videoPath: videoWithAudioPath,
        assFilePath: options.subtitleAssPath!,
        outputPath: captionedPath,
      }),
      120_000,
    );

    if (subsResult.exitCode === 0) {
      videoWithSubsPath = captionedPath;
      logger.info('[SpecRenderer] Subtitles burned in (ASS)');
    } else {
      warnings.push(`Subtitle burn-in (ASS) failed: ${subsResult.stderr.slice(-200)}`);
      logger.warn('[SpecRenderer] Subtitle ASS burn-in failed — trying drawtext fallback');

      // Fallback to drawtext if ASS failed and drawtext filter is available
      if (hasDrawTextSubs) {
        const fallbackPath = join(options.tempDir, `captioned-dt-${Date.now()}.mp4`);
        const dtResult = await runFFmpeg(
          buildSubtitleDrawTextArgs({
            videoPath: videoWithAudioPath,
            drawTextFilter: options.subtitleDrawTextFilter!,
            outputPath: fallbackPath,
          }),
          120_000,
        );
        if (dtResult.exitCode === 0) {
          videoWithSubsPath = fallbackPath;
          logger.info('[SpecRenderer] Subtitles burned in (drawtext fallback)');
        } else {
          warnings.push(`Subtitle drawtext fallback also failed`);
          logger.warn('[SpecRenderer] Subtitle drawtext fallback failed — proceeding without captions');
        }
      }
    }
  } else if (hasDrawTextSubs) {
    const captionedPath = join(options.tempDir, `captioned-dt-${Date.now()}.mp4`);
    const dtResult = await runFFmpeg(
      buildSubtitleDrawTextArgs({
        videoPath: videoWithAudioPath,
        drawTextFilter: options.subtitleDrawTextFilter!,
        outputPath: captionedPath,
      }),
      120_000,
    );

    if (dtResult.exitCode === 0) {
      videoWithSubsPath = captionedPath;
      logger.info('[SpecRenderer] Subtitles burned in (drawtext)');
    } else {
      warnings.push(`Subtitle drawtext failed: ${dtResult.stderr.slice(-200)}`);
      logger.warn('[SpecRenderer] Subtitle drawtext failed — proceeding without captions');
    }
  }

  // Finalize to output
  const slug = slugify(spec.format);
  const filename = `${slug}--${Date.now()}.mp4`;
  const outputPath = join(options.outputDir, filename);

  const finalResult = await runFFmpeg([
    '-y', '-i', videoWithSubsPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ], 30_000);

  if (finalResult.exitCode !== 0) {
    throw new Error(`Failed to finalize video: ${finalResult.stderr.slice(-500)}`);
  }

  const fileStat = await stat(outputPath);

  // Cleanup temp
  await cleanupTemp(options.tempDir);

  const elapsed = Date.now() - startTime;
  logger.info(
    `[SpecRenderer] Done: ${filename} (${(fileStat.size / 1024).toFixed(1)}KB, ` +
    `${totalDuration.toFixed(1)}s, rendered in ${(elapsed / 1000).toFixed(1)}s)`
  );

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

// ============================================================================
// Scene rendering
// ============================================================================

async function renderSceneFromSpec(
  scene: RenderSceneSpec,
  opts: {
    tempDir: string;
    assetMap: Map<string, string>;
    width: number;
    height: number;
    fps: number;
    timeoutMs: number;
    /** Default scene duration from preset motionProfile (Parte 63) */
    presetSceneDuration?: number | null;
  },
): Promise<{ index: number; clipPath: string; duration: number; transition: string } | null> {
  const { tempDir, assetMap, width, height, fps, timeoutMs } = opts;
  const clipPath = join(tempDir, `scene-${String(scene.order).padStart(3, '0')}.mp4`);
  // Parte 63: scene duration falls back to preset default, then global default
  const duration = clampDuration(scene.durationSeconds ?? opts.presetSceneDuration ?? null);

  const textOverlays: DrawTextSpec[] = scene.textOverlays.map((o) => ({
    text: o.text,
    role: o.role as DrawTextSpec['role'],
    position: o.position as DrawTextSpec['position'],
    size: o.size as DrawTextSpec['size'],
    color: scene.branding.textColor || undefined,
  }));

  // Resolve assets — support multiple assets for GRID/SPLIT layouts
  const allAssetIds = scene.assetIds ?? (scene.assetId ? [scene.assetId] : []);
  const resolvedPaths: string[] = [];
  for (const id of allAssetIds) {
    const path = assetMap.get(id);
    if (path && existsSync(path)) {
      resolvedPaths.push(path);
    }
  }

  let args: string[];

  if (resolvedPaths.length > 0) {
    // Use first asset for V1 (multi-asset GRID/SPLIT support deferred to V2 with Shotstack)
    // Log when multi-assets are available but only one is used
    if (resolvedPaths.length > 1) {
      logger.debug(
        `[SpecRenderer] Scene ${scene.order}: ${resolvedPaths.length} assets available, ` +
        `using first (layout: ${scene.layout}). Multi-asset rendering planned for V2.`
      );
    }

    args = buildImageToClipArgs({
      imagePath: resolvedPaths[0],
      outputPath: clipPath,
      duration,
      width,
      height,
      fps,
      textOverlays,
      backgroundColor: scene.branding.backgroundColor,
    });
  } else {
    // Color-background scene
    if (textOverlays.length === 0) {
      return null; // No image AND no text
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

  const result = await runFFmpeg(args, timeoutMs);

  if (result.exitCode !== 0) {
    logger.warn(`[SpecRenderer] Scene ${scene.order} ffmpeg error: ${result.stderr.slice(-200)}`);
    return null;
  }

  return {
    index: scene.order,
    clipPath,
    duration,
    transition: scene.transition,
  };
}

// ============================================================================
// Clip assembly (identical logic to video-renderer but using logger)
// ============================================================================

interface AssemblyOpts {
  tempDir: string;
  fadeDuration: number;
  width: number;
  height: number;
}

async function assembleClips(
  clips: Array<{ clipPath: string; duration: number; transition: string }>,
  opts: AssemblyOpts,
): Promise<string> {
  if (clips.length === 1) return clips[0].clipPath;

  const hasFades = clips.some((c, i) => i < clips.length - 1 && c.transition === 'fade');

  if (!hasFades) {
    return concatSimple(clips, opts.tempDir);
  }

  // Limit xfade chain to avoid progressive quality degradation (P1 fix)
  // For >6 clips, switch to concat after the 6th to avoid accumulated re-encoding loss
  const MAX_XFADE_CHAIN = 6;
  if (clips.length > MAX_XFADE_CHAIN) {
    logger.info(
      `[SpecRenderer] ${clips.length} clips exceeds xfade chain limit (${MAX_XFADE_CHAIN}). ` +
      `Using xfade for first ${MAX_XFADE_CHAIN}, concat for rest.`
    );

    const xfadeClips = clips.slice(0, MAX_XFADE_CHAIN);
    const concatClips = clips.slice(MAX_XFADE_CHAIN);

    const xfadePath = await assembleWithFades(xfadeClips, opts);
    const xfadeDuration = xfadeClips.reduce((s, c) => s + c.duration, 0)
      - (xfadeClips.length - 1) * opts.fadeDuration;

    const allForConcat = [
      { clipPath: xfadePath, duration: xfadeDuration, transition: 'cut' },
      ...concatClips,
    ];
    return concatSimple(allForConcat, opts.tempDir);
  }

  return assembleWithFades(clips, opts);
}

async function concatSimple(
  clips: Array<{ clipPath: string }>,
  tempDir: string,
): Promise<string> {
  const { writeFile } = await import('node:fs/promises');
  const listPath = join(tempDir, `concat-list-${Date.now()}.txt`);
  const outputPath = join(tempDir, `assembled-${Date.now()}.mp4`);

  const listContent = clips.map((c) => `file '${resolve(c.clipPath)}'`).join('\n');
  await writeFile(listPath, listContent);

  const result = await runFFmpeg(buildConcatArgs({ listFilePath: listPath, outputPath }));
  if (result.exitCode !== 0) {
    throw new Error(`Concat failed: ${result.stderr.slice(-500)}`);
  }
  return outputPath;
}

async function assembleWithFades(
  clips: Array<{ clipPath: string; duration: number; transition: string }>,
  opts: AssemblyOpts,
): Promise<string> {
  const { writeFile } = await import('node:fs/promises');
  let currentPath = clips[0].clipPath;
  let currentDuration = clips[0].duration;

  for (let i = 1; i < clips.length; i++) {
    const next = clips[i];
    const prevTransition = clips[i - 1].transition;
    const stepOutput = join(opts.tempDir, `xfade-step-${i}-${Date.now()}.mp4`);

    if (prevTransition === 'fade' && opts.fadeDuration > 0) {
      const safeFade = Math.min(opts.fadeDuration, currentDuration * 0.4, next.duration * 0.4);
      const result = await runFFmpeg(buildXfadeArgs({
        clip1Path: currentPath,
        clip2Path: next.clipPath,
        outputPath: stepOutput,
        fadeDuration: safeFade,
        clip1Duration: currentDuration,
        width: opts.width,
        height: opts.height,
      }), 30_000);

      if (result.exitCode !== 0) {
        logger.warn(`[SpecRenderer] xfade failed at step ${i}, falling back to cut`);
        await concatTwoPaths(currentPath, next.clipPath, stepOutput, opts.tempDir);
        currentDuration += next.duration;
      } else {
        currentDuration += next.duration - safeFade;
      }
    } else {
      await concatTwoPaths(currentPath, next.clipPath, stepOutput, opts.tempDir);
      currentDuration += next.duration;
    }

    currentPath = stepOutput;
  }

  return currentPath;
}

async function concatTwoPaths(
  a: string, b: string, output: string, tempDir: string,
): Promise<void> {
  const { writeFile } = await import('node:fs/promises');
  const listPath = join(tempDir, `concat-pair-${Date.now()}.txt`);
  await writeFile(listPath, `file '${resolve(a)}'\nfile '${resolve(b)}'`);

  const result = await runFFmpeg(buildConcatArgs({ listFilePath: listPath, outputPath: output }));
  if (result.exitCode !== 0) {
    throw new Error(`Concat pair failed: ${result.stderr.slice(-500)}`);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function clampDuration(d: number | null): number {
  if (d == null) return DEFAULT_SCENE_DURATION;
  return Math.max(MIN_SCENE_DURATION, Math.min(MAX_SCENE_DURATION, d));
}

function normalizeColor(color: string): string {
  if (color.startsWith('#')) return `0x${color.slice(1)}`;
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

async function cleanupTemp(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}
