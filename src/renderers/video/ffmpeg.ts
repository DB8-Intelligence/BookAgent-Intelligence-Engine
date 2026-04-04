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

function escapeFFmpegText(text: string): string {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%')
    .replace(/\n/g, '');
}
