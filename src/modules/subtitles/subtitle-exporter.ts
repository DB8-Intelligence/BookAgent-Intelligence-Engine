/**
 * Subtitle Exporter — Subtitle/Caption Engine
 *
 * Exporta SubtitleTrack em múltiplos formatos:
 *   - SRT (SubRip) — padrão universal
 *   - VTT (WebVTT) — padrão web
 *   - FFmpeg drawtext filter — para burn-in (hardcoded)
 *
 * Parte 64: Subtitle/Caption Engine
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { SubtitleTrack, SubtitleCue, CaptionStyle } from '../../domain/entities/subtitle.js';
import { CaptionBackground, CaptionPosition } from '../../domain/entities/subtitle.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// SRT Export
// ---------------------------------------------------------------------------

/**
 * Gera conteúdo SRT a partir de um SubtitleTrack.
 *
 * Formato:
 *   1
 *   00:00:01,000 --> 00:00:04,500
 *   Texto da legenda
 */
export function toSRT(track: SubtitleTrack): string {
  return track.cues.map((cue) => {
    return [
      String(cue.index),
      `${formatTimeSRT(cue.startSeconds)} --> ${formatTimeSRT(cue.endSeconds)}`,
      cue.text,
    ].join('\n');
  }).join('\n\n') + '\n';
}

/**
 * Salva SubtitleTrack como arquivo .srt.
 */
export async function exportSRT(track: SubtitleTrack, outputDir: string): Promise<string> {
  const content = toSRT(track);
  const filename = `subtitles-${track.sourcePlanId.slice(0, 8)}.srt`;
  const filePath = join(outputDir, filename);
  await writeFile(filePath, content, 'utf-8');
  logger.info(`[SubtitleExporter] SRT exported: ${filePath} (${track.cues.length} cues)`);
  return filePath;
}

// ---------------------------------------------------------------------------
// VTT Export
// ---------------------------------------------------------------------------

/**
 * Gera conteúdo WebVTT a partir de um SubtitleTrack.
 *
 * Formato:
 *   WEBVTT
 *
 *   1
 *   00:00:01.000 --> 00:00:04.500
 *   Texto da legenda
 */
export function toVTT(track: SubtitleTrack): string {
  const header = 'WEBVTT\n\n';
  const cuesStr = track.cues.map((cue) => {
    return [
      String(cue.index),
      `${formatTimeVTT(cue.startSeconds)} --> ${formatTimeVTT(cue.endSeconds)}`,
      cue.text,
    ].join('\n');
  }).join('\n\n');

  return header + cuesStr + '\n';
}

/**
 * Salva SubtitleTrack como arquivo .vtt.
 */
export async function exportVTT(track: SubtitleTrack, outputDir: string): Promise<string> {
  const content = toVTT(track);
  const filename = `subtitles-${track.sourcePlanId.slice(0, 8)}.vtt`;
  const filePath = join(outputDir, filename);
  await writeFile(filePath, content, 'utf-8');
  logger.info(`[SubtitleExporter] VTT exported: ${filePath} (${track.cues.length} cues)`);
  return filePath;
}

// ---------------------------------------------------------------------------
// FFmpeg Burn-in (Hardcoded Subtitles)
// ---------------------------------------------------------------------------

/**
 * Gera um filtro FFmpeg drawtext para cada cue, usando enable entre timestamps.
 *
 * Cada cue vira um drawtext com:
 *   enable='between(t, start, end)'
 *
 * Retorna string pronta para -vf ou -filter_complex.
 */
export function toFFmpegFilter(
  track: SubtitleTrack,
  frameWidth: number,
  frameHeight: number,
): string {
  if (track.cues.length === 0) return '';

  const style = track.captionStyle;
  const filters = track.cues.map((cue) =>
    buildCueFfmpegFilter(cue, style, frameWidth, frameHeight),
  );

  return filters.join(',');
}

/**
 * Salva SubtitleTrack como arquivo .ass (ASS/SSA) para uso com FFmpeg subtitles filter.
 * Mais robusto que drawtext para textos com formatação.
 */
export async function exportASS(track: SubtitleTrack, outputDir: string): Promise<string> {
  const content = toASS(track);
  const filename = `subtitles-${track.sourcePlanId.slice(0, 8)}.ass`;
  const filePath = join(outputDir, filename);
  await writeFile(filePath, content, 'utf-8');
  logger.info(`[SubtitleExporter] ASS exported: ${filePath} (${track.cues.length} cues)`);
  return filePath;
}

/**
 * Gera conteúdo ASS (Advanced SubStation Alpha) — usado pelo filtro subtitles do FFmpeg.
 * Formato mais robusto que drawtext para legendas longas e formatação complexa.
 */
export function toASS(track: SubtitleTrack): string {
  const style = track.captionStyle;
  const fontSize = resolveAssFontSize(style.fontSize);
  const fontColor = hexToASSColor(style.fontColor);
  const bgColor = style.background === CaptionBackground.NONE
    ? '&H00000000'
    : hexToASSColor(style.backgroundColor, style.background === CaptionBackground.BOX_TRANSPARENT ? '80' : 'FF');
  const alignment = resolveAssAlignment(style.position);
  const outlineSize = style.background === CaptionBackground.OUTLINE ? 2 : 0;
  const shadowSize = style.background === CaptionBackground.SHADOW ? 2 : 0;
  const borderStyle = (style.background === CaptionBackground.BOX || style.background === CaptionBackground.BOX_TRANSPARENT) ? 3 : 1;

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: 1080`,
    `PlayResY: 1920`,
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,Arial,${fontSize},${fontColor},${fontColor},&H00000000,${bgColor},1,0,0,0,100,100,0,0,${borderStyle},${outlineSize},${shadowSize},${alignment},40,40,60,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const events = track.cues.map((cue) => {
    const start = formatTimeASS(cue.startSeconds);
    const end = formatTimeASS(cue.endSeconds);
    const text = cue.text.replace(/\n/g, '\\N');
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
  });

  return header + '\n' + events.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// FFmpeg filter builders
// ---------------------------------------------------------------------------

function buildCueFfmpegFilter(
  cue: SubtitleCue,
  style: CaptionStyle,
  frameWidth: number,
  frameHeight: number,
): string {
  const fontSize = resolveFontSize(style.fontSize, frameHeight);
  const textColor = style.fontColor.replace('#', '');
  const y = resolveCaptionY(style.position, frameHeight, fontSize);
  const safeText = escapeFFmpegText(cue.text.replace(/\n/g, ' '));

  const parts = [
    `drawtext=text='${safeText}'`,
    `fontsize=${fontSize}`,
    `fontcolor=0x${textColor}`,
    `x=(w-text_w)/2`,
    `y=${y}`,
    `enable='between(t\\,${cue.startSeconds}\\,${cue.endSeconds})'`,
  ];

  // Background box
  if (style.background === CaptionBackground.BOX || style.background === CaptionBackground.BOX_TRANSPARENT) {
    const bgAlpha = style.background === CaptionBackground.BOX_TRANSPARENT ? '0.6' : '1.0';
    const bgHex = style.backgroundColor.replace('#', '');
    parts.push(`box=1`);
    parts.push(`boxcolor=0x${bgHex}@${bgAlpha}`);
    parts.push(`boxborderw=10`);
  }

  // Shadow
  if (style.background === CaptionBackground.SHADOW) {
    parts.push(`shadowcolor=black@0.7`);
    parts.push(`shadowx=2`);
    parts.push(`shadowy=2`);
  }

  return parts.join(':');
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

/** SRT format: HH:MM:SS,mmm */
function formatTimeSRT(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`;
}

/** VTT format: HH:MM:SS.mmm */
function formatTimeVTT(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(ms)}`;
}

/** ASS format: H:MM:SS.cc (centiseconds) */
function formatTimeASS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${pad2(m)}:${pad2(s)}.${pad2(cs)}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad2(n: number): string { return String(n).padStart(2, '0'); }
function pad3(n: number): string { return String(n).padStart(3, '0'); }

function resolveFontSize(size: string, frameHeight: number): number {
  switch (size) {
    case 'large': return Math.round(frameHeight * 0.038);
    case 'medium': return Math.round(frameHeight * 0.028);
    case 'small': return Math.round(frameHeight * 0.022);
    default: return Math.round(frameHeight * 0.028);
  }
}

function resolveAssFontSize(size: string): number {
  switch (size) {
    case 'large': return 72;
    case 'medium': return 54;
    case 'small': return 42;
    default: return 54;
  }
}

function resolveCaptionY(position: CaptionPosition, frameHeight: number, fontSize: number): string {
  switch (position) {
    case CaptionPosition.TOP: return String(Math.round(frameHeight * 0.08));
    case CaptionPosition.CENTER: return `(h-${fontSize})/2`;
    case CaptionPosition.BOTTOM: return String(Math.round(frameHeight * 0.88));
    default: return String(Math.round(frameHeight * 0.88));
  }
}

/** ASS alignment: 1=bottom-left, 2=bottom-center, 5=top-center, 8=center */
function resolveAssAlignment(position: CaptionPosition): number {
  switch (position) {
    case CaptionPosition.TOP: return 8;
    case CaptionPosition.CENTER: return 5;
    case CaptionPosition.BOTTOM: return 2;
    default: return 2;
  }
}

/** Convert hex color to ASS color format &HAABBGGRR */
function hexToASSColor(hex: string, alpha = 'FF'): string {
  const clean = hex.replace('#', '');
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  // ASS is &HAABBGGRR (alpha inverted: 00=opaque, FF=transparent)
  const invertedAlpha = alpha === 'FF' ? '00' : alpha === '80' ? '80' : 'FF';
  return `&H${invertedAlpha}${b}${g}${r}`;
}

function escapeFFmpegText(text: string): string {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/:/g, '\\:')
    .replace(/;/g, '\\;')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g, '%%')
    .replace(/\n/g, '')
    .replace(/\r/g, '');
}
