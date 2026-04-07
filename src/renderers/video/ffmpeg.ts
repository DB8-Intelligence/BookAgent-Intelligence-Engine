/**
 * FFmpeg Command Builder & Executor
 *
 * Abstração de baixo nível para execução de comandos ffmpeg.
 * Handles spawning, error capture, and timeout.
 */

import { spawn } from 'node:child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FFmpegResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

/**
 * Executa um comando ffmpeg com os argumentos fornecidos.
 * Retorna stdout/stderr e exit code.
 */
export function runFFmpeg(args: string[], timeoutMs = 120_000): Promise<FFmpegResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, timeoutMs);

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`ffmpeg spawn error: ${err.message}`));
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
        return;
      }
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

/**
 * Verifica se o ffmpeg está disponível no sistema.
 */
export async function checkFFmpeg(): Promise<boolean> {
  try {
    const result = await runFFmpeg(['-version'], 5_000);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Scene generation helpers
// ---------------------------------------------------------------------------

/**
 * Gera um clip de vídeo a partir de uma imagem estática.
 *
 * ffmpeg -loop 1 -i image.jpg -t 5 -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black" \
 *   -c:v libx264 -pix_fmt yuv420p -r 30 output.mp4
 */
export function buildImageToClipArgs(opts: {
  imagePath: string;
  outputPath: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  textOverlays?: DrawTextSpec[];
  backgroundColor?: string;
}): string[] {
  const { imagePath, outputPath, duration, width, height, fps, textOverlays, backgroundColor } = opts;
  const bgColor = backgroundColor ?? 'black';

  // Build filter chain
  const filters: string[] = [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:${bgColor}`,
    `setsar=1`,
  ];

  // Add text overlays
  if (textOverlays && textOverlays.length > 0) {
    for (const overlay of textOverlays) {
      filters.push(buildDrawTextFilter(overlay, width, height));
    }
  }

  return [
    '-y',
    '-loop', '1',
    '-i', imagePath,
    '-t', String(duration),
    '-vf', filters.join(','),
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    '-movflags', '+faststart',
    outputPath,
  ];
}

/**
 * Gera um clip de vídeo com fundo sólido colorido (sem imagem).
 */
export function buildColorClipArgs(opts: {
  outputPath: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  backgroundColor: string;
  textOverlays?: DrawTextSpec[];
}): string[] {
  const { outputPath, duration, width, height, fps, backgroundColor, textOverlays } = opts;

  // Build filter chain starting from color source
  const filters: string[] = [];

  if (textOverlays && textOverlays.length > 0) {
    for (const overlay of textOverlays) {
      filters.push(buildDrawTextFilter(overlay, width, height));
    }
  }

  const vf = filters.length > 0 ? ['-vf', filters.join(',')] : [];

  return [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=${backgroundColor}:s=${width}x${height}:d=${duration}:r=${fps}`,
    ...vf,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ];
}

/**
 * Concatena clips usando o concat demuxer (rápido, sem re-encoding para cut).
 */
export function buildConcatArgs(opts: {
  listFilePath: string;
  outputPath: string;
}): string[] {
  return [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', opts.listFilePath,
    '-c', 'copy',
    '-movflags', '+faststart',
    opts.outputPath,
  ];
}

/**
 * Aplica crossfade (xfade) entre dois clips.
 *
 * Para V1, usamos apenas fade e cut. xfade requer filter_complex.
 */
export function buildXfadeArgs(opts: {
  clip1Path: string;
  clip2Path: string;
  outputPath: string;
  fadeDuration: number;
  clip1Duration: number;
  width: number;
  height: number;
}): string[] {
  const { clip1Path, clip2Path, outputPath, fadeDuration, clip1Duration } = opts;
  const offset = Math.max(0, clip1Duration - fadeDuration);

  return [
    '-y',
    '-i', clip1Path,
    '-i', clip2Path,
    '-filter_complex',
    `[0:v][1:v]xfade=transition=fade:duration=${fadeDuration}:offset=${offset}[v]`,
    '-map', '[v]',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ];
}

// ---------------------------------------------------------------------------
// Audio mixing — Parte 62: Background Music Engine
// ---------------------------------------------------------------------------

export interface AudioMixOpts {
  /** Path to the video file (with or without existing audio) */
  videoPath: string;
  /** Path to the background music track */
  musicPath: string;
  /** Path to optional narration audio */
  narrationPath?: string;
  /** Output path for the mixed video */
  outputPath: string;
  /** Music volume 0.0-1.0 (default: 0.15) */
  musicVolume?: number;
  /** Narration volume 0.0-1.0 (default: 1.0) */
  narrationVolume?: number;
  /** Ducking reduction in dB (default: -10) — applied to music when narration is present */
  duckingDb?: number;
  /** Fade-in duration for music (seconds) */
  fadeInSeconds?: number;
  /** Fade-out duration for music (seconds) */
  fadeOutSeconds?: number;
  /** Total video duration (seconds) — needed for fade-out timing */
  videoDurationSeconds: number;
}

/**
 * Builds ffmpeg args to mix background music into a video.
 *
 * Strategy:
 * - If narration exists: music + narration → ducking (sidechaincompress or volume reduction)
 * - If no narration: music only at set volume
 * - Always: fade in at start, fade out at end
 *
 * Simple ducking approach (V1):
 *   Music is set to a low volume (musicVolume) and further reduced by duckingDb.
 *   When narration is present, both are mixed; narration always has priority.
 */
export function buildAudioMixArgs(opts: AudioMixOpts): string[] {
  const musicVol = opts.musicVolume ?? 0.15;
  const narrationVol = opts.narrationVolume ?? 1.0;
  const fadeIn = opts.fadeInSeconds ?? 2;
  const fadeOut = opts.fadeOutSeconds ?? 3;
  const duration = opts.videoDurationSeconds;
  const fadeOutStart = Math.max(0, duration - fadeOut);

  // Build music filter: volume + fade in + fade out
  const musicFilter = [
    `volume=${musicVol}`,
    `afade=t=in:st=0:d=${fadeIn}`,
    `afade=t=out:st=${fadeOutStart}:d=${fadeOut}`,
  ].join(',');

  if (opts.narrationPath) {
    // 3 inputs: video, music, narration
    // Mix narration (loud) + music (quiet with ducking)
    const duckVol = dbToVolume(opts.duckingDb ?? -10);
    const duckFilter = `volume=${(musicVol * duckVol).toFixed(4)}`;

    return [
      '-y',
      '-i', opts.videoPath,
      '-i', opts.musicPath,
      '-i', opts.narrationPath,
      '-filter_complex',
      // Music: set volume + fade
      `[1:a]${musicFilter},${duckFilter}[music];` +
      // Narration: set volume
      `[2:a]volume=${narrationVol}[narr];` +
      // Mix music + narration
      `[music][narr]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
      '-map', '0:v',
      '-map', '[aout]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-movflags', '+faststart',
      opts.outputPath,
    ];
  }

  // 2 inputs: video + music only (no narration)
  return [
    '-y',
    '-i', opts.videoPath,
    '-i', opts.musicPath,
    '-filter_complex',
    `[1:a]${musicFilter}[music]`,
    '-map', '0:v',
    '-map', '[music]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    opts.outputPath,
  ];
}

/**
 * Builds ffmpeg args to mix narration audio onto a video (without music).
 * Used as fallback when no music track is available.
 */
export function buildNarrationOverlayArgs(opts: {
  videoPath: string;
  narrationPath: string;
  outputPath: string;
  narrationVolume?: number;
}): string[] {
  const vol = opts.narrationVolume ?? 1.0;

  return [
    '-y',
    '-i', opts.videoPath,
    '-i', opts.narrationPath,
    '-filter_complex',
    `[1:a]volume=${vol}[narr]`,
    '-map', '0:v',
    '-map', '[narr]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    opts.outputPath,
  ];
}

/** Convert dB reduction to linear volume multiplier */
function dbToVolume(db: number): number {
  return Math.pow(10, db / 20);
}

// ---------------------------------------------------------------------------
// Subtitle burn-in — Parte 64: Subtitle/Caption Engine
// ---------------------------------------------------------------------------

/**
 * Builds ffmpeg args to burn subtitles into a video using ASS file.
 * Uses the "ass" filter which supports rich formatting.
 */
export function buildSubtitleBurnInArgs(opts: {
  videoPath: string;
  assFilePath: string;
  outputPath: string;
}): string[] {
  // Use subtitles filter with ASS file for rich formatting
  // The file path needs forward slashes and escaping for filter syntax
  const safePath = opts.assFilePath.replace(/\\/g, '/').replace(/:/g, '\\:');

  return [
    '-y',
    '-i', opts.videoPath,
    '-vf', `ass='${safePath}'`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    opts.outputPath,
  ];
}

/**
 * Builds ffmpeg args to burn subtitles using drawtext filters (fallback).
 * Less robust than ASS but doesn't require libass.
 */
export function buildSubtitleDrawTextArgs(opts: {
  videoPath: string;
  drawTextFilter: string;
  outputPath: string;
}): string[] {
  return [
    '-y',
    '-i', opts.videoPath,
    '-vf', opts.drawTextFilter,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    opts.outputPath,
  ];
}

// ---------------------------------------------------------------------------
// DrawText filter
// ---------------------------------------------------------------------------

export interface DrawTextSpec {
  text: string;
  role: 'headline' | 'body' | 'caption' | 'cta';
  position: 'top' | 'center' | 'bottom';
  size: 'large' | 'medium' | 'small';
  color?: string;
  backgroundColor?: string;
}

function buildDrawTextFilter(spec: DrawTextSpec, frameWidth: number, frameHeight: number): string {
  const fontSize = resolveSize(spec.size, frameHeight);
  const textColor = spec.color ?? 'white';
  const boxColor = spec.backgroundColor ?? 'black@0.5';
  const y = resolveY(spec.position, frameHeight, fontSize);

  // Escape text for ffmpeg drawtext
  const safeText = escapeFFmpegText(spec.text);

  return [
    `drawtext=text='${safeText}'`,
    `fontsize=${fontSize}`,
    `fontcolor=${textColor}`,
    `x=(w-text_w)/2`,
    `y=${y}`,
    `box=1`,
    `boxcolor=${boxColor}`,
    `boxborderw=12`,
  ].join(':');
}

function resolveSize(size: string, frameHeight: number): number {
  switch (size) {
    case 'large': return Math.round(frameHeight * 0.045);
    case 'medium': return Math.round(frameHeight * 0.032);
    case 'small': return Math.round(frameHeight * 0.024);
    default: return Math.round(frameHeight * 0.032);
  }
}

function resolveY(position: string, frameHeight: number, fontSize: number): string {
  switch (position) {
    case 'top': return String(Math.round(frameHeight * 0.08));
    case 'center': return `(h-${fontSize})/2`;
    case 'bottom': return String(Math.round(frameHeight * 0.85));
    default: return `(h-${fontSize})/2`;
  }
}

/**
 * Escapes text for FFmpeg drawtext filter.
 * Must handle: backslash, quote, colon, semicolon, percent, brackets, newlines.
 * Order matters: backslash must be escaped first.
 */
function escapeFFmpegText(text: string): string {
  return text
    .replace(/\\/g, '\\\\\\\\')     // backslash
    .replace(/'/g, "\\'")           // single quote
    .replace(/"/g, '\\"')           // double quote (P1 fix)
    .replace(/:/g, '\\:')           // colon (drawtext separator)
    .replace(/;/g, '\\;')           // semicolon (P1 fix)
    .replace(/\[/g, '\\[')          // brackets (P1 fix)
    .replace(/\]/g, '\\]')          // brackets (P1 fix)
    .replace(/%/g, '%%')            // percent (drawtext expansion)
    .replace(/\n/g, '')             // newlines not supported in drawtext
    .replace(/\r/g, '');            // carriage return
}
