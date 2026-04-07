/**
 * Entity: SubtitleTrack / SubtitleCue / CaptionStyle
 *
 * Estruturas para o Subtitle/Caption Engine.
 *
 * - SubtitleCue: bloco atômico de legenda (texto + timing)
 * - SubtitleTrack: sequência completa de cues para um vídeo
 * - CaptionStyle: estilo visual das legendas
 *
 * Parte 64: Subtitle/Caption Engine
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Posição vertical das legendas */
export enum CaptionPosition {
  TOP = 'top',
  CENTER = 'center',
  BOTTOM = 'bottom',
}

/** Estilo de fundo das legendas */
export enum CaptionBackground {
  NONE = 'none',               // Sem fundo
  BOX = 'box',                 // Caixa sólida
  BOX_TRANSPARENT = 'box-transparent', // Caixa semi-transparente
  OUTLINE = 'outline',         // Contorno no texto
  SHADOW = 'shadow',           // Sombra no texto
}

/** Formato de exportação de legendas */
export enum SubtitleFormat {
  SRT = 'srt',
  VTT = 'vtt',
  HARDCODED = 'hardcoded',     // Burned into video via FFmpeg
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/**
 * Cue individual — um bloco de legenda com timing.
 * Equivalente a uma entrada .srt/.vtt.
 */
export interface SubtitleCue {
  /** Índice sequencial (1-based para compatibilidade SRT) */
  index: number;

  /** Texto da legenda (pode ter até 2 linhas, ~42 chars/linha) */
  text: string;

  /** Início em segundos */
  startSeconds: number;

  /** Fim em segundos */
  endSeconds: number;

  /** ID do segmento de áudio correspondente (para sync) */
  audioSegmentId?: string;

  /** ID da cena correspondente */
  sceneId?: string;

  /** Papel narrativo (hook, context, cta, etc.) */
  role?: string;
}

/**
 * Track completa de legendas para um vídeo.
 */
export interface SubtitleTrack {
  /** ID único da track */
  id: string;

  /** ID do plano de origem (AudioPlan, MediaPlan, etc.) */
  sourcePlanId: string;

  /** Idioma (BCP-47, ex: 'pt-BR') */
  language: string;

  /** Sequência de cues ordenada */
  cues: SubtitleCue[];

  /** Duração total coberta pelas legendas (segundos) */
  totalDurationSeconds: number;

  /** Número total de caracteres */
  totalCharacters: number;

  /** Estilo visual aplicado */
  captionStyle: CaptionStyle;
}

/**
 * Estilo visual das legendas — define aparência no vídeo.
 * Compatível com FFmpeg drawtext e WhatsApp/Instagram.
 */
export interface CaptionStyle {
  /** Posição vertical */
  position: CaptionPosition;

  /** Tamanho da fonte relativo: 'small' | 'medium' | 'large' */
  fontSize: 'small' | 'medium' | 'large';

  /** Cor do texto (hex) */
  fontColor: string;

  /** Tipo de fundo */
  background: CaptionBackground;

  /** Cor do fundo (hex, quando background é box/box-transparent) */
  backgroundColor: string;

  /** Máximo de caracteres por linha */
  maxCharsPerLine: number;

  /** Máximo de linhas simultâneas */
  maxLines: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Estilo padrão — otimizado para WhatsApp/Instagram (texto legível em telas pequenas) */
export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  position: CaptionPosition.BOTTOM,
  fontSize: 'medium',
  fontColor: '#FFFFFF',
  background: CaptionBackground.BOX_TRANSPARENT,
  backgroundColor: '#000000',
  maxCharsPerLine: 42,
  maxLines: 2,
};

/** Estilo para reels/stories — texto maior, posição central-baixa */
export const REEL_CAPTION_STYLE: CaptionStyle = {
  position: CaptionPosition.BOTTOM,
  fontSize: 'large',
  fontColor: '#FFFFFF',
  background: CaptionBackground.BOX_TRANSPARENT,
  backgroundColor: '#000000',
  maxCharsPerLine: 35,
  maxLines: 2,
};

/** Estilo minimalista — sem fundo, texto com sombra */
export const MINIMAL_CAPTION_STYLE: CaptionStyle = {
  position: CaptionPosition.BOTTOM,
  fontSize: 'medium',
  fontColor: '#FFFFFF',
  background: CaptionBackground.SHADOW,
  backgroundColor: '#000000',
  maxCharsPerLine: 42,
  maxLines: 2,
};
