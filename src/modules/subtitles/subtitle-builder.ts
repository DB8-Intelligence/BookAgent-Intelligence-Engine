/**
 * Subtitle Builder — Subtitle/Caption Engine
 *
 * Gera SubtitleTrack a partir de AudioPlan, NarrativePlan ou RenderSpec.
 *
 * Estratégia de segmentação:
 *   1. Cada AudioSegment → 1+ cues (quebra por maxCharsPerLine)
 *   2. Timing baseado em estimatedDurationSeconds do segmento
 *   3. Pausas respeitadas entre cues
 *   4. Se sem AudioPlan, usa narration do RenderSpec (scene-based)
 *
 * Parte 64: Subtitle/Caption Engine
 */

import { v4 as uuid } from 'uuid';

import type { AudioPlan, AudioSegment } from '../../domain/entities/audio-plan.js';
import type { NarrativePlan } from '../../domain/entities/narrative.js';
import type { RenderSpec } from '../../types/render-spec.js';
import type { SubtitleTrack, SubtitleCue, CaptionStyle } from '../../domain/entities/subtitle.js';
import {
  DEFAULT_CAPTION_STYLE,
  REEL_CAPTION_STYLE,
} from '../../domain/entities/subtitle.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Velocidade média de leitura — chars/segundo */
const READING_SPEED_CPS = 15;

/** Duração mínima de um cue (segundos) */
const MIN_CUE_DURATION = 1.0;

/** Duração máxima de um cue (segundos) */
const MAX_CUE_DURATION = 6.0;

/** Gap mínimo entre cues (segundos) */
const CUE_GAP = 0.1;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Constrói SubtitleTrack a partir de um AudioPlan.
 * Fonte mais precisa — usa timing real dos segmentos de áudio.
 */
export function buildSubtitleTrackFromAudio(
  audioPlan: AudioPlan,
  style?: CaptionStyle,
): SubtitleTrack {
  const captionStyle = style ?? resolveStyleForFormat(audioPlan.outputFormat);
  const cues = buildCuesFromAudioSegments(audioPlan.segments, captionStyle);

  const totalChars = cues.reduce((sum, c) => sum + c.text.length, 0);
  const totalDuration = cues.length > 0
    ? cues[cues.length - 1].endSeconds
    : 0;

  logger.info(
    `[SubtitleBuilder] Built ${cues.length} cues from AudioPlan ` +
    `"${audioPlan.title}" (${totalDuration.toFixed(1)}s)`,
  );

  return {
    id: uuid(),
    sourcePlanId: audioPlan.id,
    language: 'pt-BR',
    cues,
    totalDurationSeconds: totalDuration,
    totalCharacters: totalChars,
    captionStyle,
  };
}

/**
 * Constrói SubtitleTrack a partir de um RenderSpec (scene narration).
 * Fallback quando não há AudioPlan — usa voiceover text das cenas.
 */
export function buildSubtitleTrackFromSpec(
  spec: RenderSpec,
  style?: CaptionStyle,
): SubtitleTrack {
  const captionStyle = style ?? resolveStyleForFormat(spec.format);
  const cues = buildCuesFromSceneNarration(spec, captionStyle);

  const totalChars = cues.reduce((sum, c) => sum + c.text.length, 0);
  const totalDuration = cues.length > 0
    ? cues[cues.length - 1].endSeconds
    : 0;

  logger.info(
    `[SubtitleBuilder] Built ${cues.length} cues from RenderSpec ` +
    `"${spec.format}" (${totalDuration.toFixed(1)}s)`,
  );

  return {
    id: uuid(),
    sourcePlanId: spec.format,
    language: 'pt-BR',
    cues,
    totalDurationSeconds: totalDuration,
    totalCharacters: totalChars,
    captionStyle,
  };
}

/**
 * Constrói SubtitleTrack a partir de um NarrativePlan (audio-only).
 * Usa beat briefings como texto base.
 */
export function buildSubtitleTrackFromNarrative(
  narrative: NarrativePlan,
  style?: CaptionStyle,
): SubtitleTrack {
  const captionStyle = style ?? DEFAULT_CAPTION_STYLE;
  const cues: SubtitleCue[] = [];
  let currentTime = 0;
  let cueIndex = 1;

  for (const beat of narrative.beats) {
    const text = beat.suggestedHeadline || beat.briefing;
    if (!text || text.trim().length < 3) continue;

    const lines = splitTextIntoCueLines(text, captionStyle.maxCharsPerLine, captionStyle.maxLines);
    const duration = beat.estimatedDurationSeconds ?? estimateDuration(text);

    for (const line of lines) {
      const lineDuration = Math.min(
        MAX_CUE_DURATION,
        Math.max(MIN_CUE_DURATION, (duration / lines.length)),
      );

      cues.push({
        index: cueIndex++,
        text: line,
        startSeconds: round2(currentTime),
        endSeconds: round2(currentTime + lineDuration),
        role: beat.role,
      });

      currentTime += lineDuration + CUE_GAP;
    }
  }

  const totalChars = cues.reduce((sum, c) => sum + c.text.length, 0);
  const totalDuration = cues.length > 0 ? cues[cues.length - 1].endSeconds : 0;

  return {
    id: uuid(),
    sourcePlanId: narrative.id,
    language: 'pt-BR',
    cues,
    totalDurationSeconds: totalDuration,
    totalCharacters: totalChars,
    captionStyle,
  };
}

// ---------------------------------------------------------------------------
// Cue builders
// ---------------------------------------------------------------------------

function buildCuesFromAudioSegments(
  segments: AudioSegment[],
  style: CaptionStyle,
): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let currentTime = 0;
  let cueIndex = 1;

  for (const segment of segments) {
    if (!segment.text || segment.text.trim().length < 2) {
      currentTime += segment.estimatedDurationSeconds + segment.pauseAfterSeconds;
      continue;
    }

    const lines = splitTextIntoCueLines(segment.text, style.maxCharsPerLine, style.maxLines);
    const segmentDuration = segment.estimatedDurationSeconds;
    const durationPerLine = segmentDuration / lines.length;

    for (const line of lines) {
      const lineDuration = Math.min(MAX_CUE_DURATION, Math.max(MIN_CUE_DURATION, durationPerLine));

      cues.push({
        index: cueIndex++,
        text: line,
        startSeconds: round2(currentTime),
        endSeconds: round2(currentTime + lineDuration),
        audioSegmentId: `seg-${segment.order}`,
        sceneId: segment.sceneId,
        role: segment.role,
      });

      currentTime += lineDuration + CUE_GAP;
    }

    // Respect pause after segment
    currentTime += segment.pauseAfterSeconds;
  }

  return cues;
}

function buildCuesFromSceneNarration(
  spec: RenderSpec,
  style: CaptionStyle,
): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let currentTime = 0;
  let cueIndex = 1;

  for (const scene of spec.scenes) {
    const narration = scene.narration;
    const text = narration?.voiceover || narration?.headline;
    const duration = scene.durationSeconds ?? 4;

    if (!text || text.trim().length < 3) {
      currentTime += duration;
      continue;
    }

    const lines = splitTextIntoCueLines(text, style.maxCharsPerLine, style.maxLines);
    const durationPerLine = duration / lines.length;

    for (const line of lines) {
      const lineDuration = Math.min(MAX_CUE_DURATION, Math.max(MIN_CUE_DURATION, durationPerLine));

      cues.push({
        index: cueIndex++,
        text: line,
        startSeconds: round2(currentTime),
        endSeconds: round2(currentTime + lineDuration),
        sceneId: `scene-${scene.order}`,
        role: scene.role,
      });

      currentTime += lineDuration + CUE_GAP;
    }

    // Fill remaining scene time
    const usedTime = lines.length * (Math.min(MAX_CUE_DURATION, Math.max(MIN_CUE_DURATION, durationPerLine)) + CUE_GAP);
    const remaining = duration - usedTime;
    if (remaining > 0) currentTime += remaining;
  }

  return cues;
}

// ---------------------------------------------------------------------------
// Text segmentation
// ---------------------------------------------------------------------------

/**
 * Quebra texto longo em linhas para legendas.
 * Respeita maxCharsPerLine e maxLines por cue.
 * Retorna array de strings, cada uma sendo um cue completo.
 */
function splitTextIntoCueLines(
  text: string,
  maxCharsPerLine: number,
  maxLines: number,
): string[] {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  if (cleanText.length === 0) return [];

  // Se cabe em um cue (maxLines * maxCharsPerLine), retorna direto
  const maxCharsPerCue = maxCharsPerLine * maxLines;
  if (cleanText.length <= maxCharsPerCue) {
    return [wrapLines(cleanText, maxCharsPerLine)];
  }

  // Quebrar em múltiplos cues
  const cues: string[] = [];
  const words = cleanText.split(' ');
  let currentCue = '';

  for (const word of words) {
    const candidate = currentCue ? `${currentCue} ${word}` : word;

    if (candidate.length > maxCharsPerCue) {
      if (currentCue) {
        cues.push(wrapLines(currentCue, maxCharsPerLine));
      }
      currentCue = word;
    } else {
      currentCue = candidate;
    }
  }

  if (currentCue) {
    cues.push(wrapLines(currentCue, maxCharsPerLine));
  }

  return cues;
}

/**
 * Insere quebras de linha a cada ~maxCharsPerLine caracteres,
 * quebrando em espaços (word boundary).
 */
function wrapLines(text: string, maxCharsPerLine: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Style resolution
// ---------------------------------------------------------------------------

function resolveStyleForFormat(format: string): CaptionStyle {
  switch (format) {
    case 'reel':
    case 'story':
      return REEL_CAPTION_STYLE;
    default:
      return DEFAULT_CAPTION_STYLE;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimateDuration(text: string): number {
  return Math.max(MIN_CUE_DURATION, text.length / READING_SPEED_CPS);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
