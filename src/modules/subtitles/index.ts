/**
 * Subtitles Module — Subtitle/Caption Engine
 *
 * Expõe a API pública do módulo de legendas.
 *
 * Parte 64: Subtitle/Caption Engine
 */

// Builder
export {
  buildSubtitleTrackFromAudio,
  buildSubtitleTrackFromSpec,
  buildSubtitleTrackFromNarrative,
} from './subtitle-builder.js';

// Exporter
export {
  toSRT,
  toVTT,
  toASS,
  toFFmpegFilter,
  exportSRT,
  exportVTT,
  exportASS,
} from './subtitle-exporter.js';
