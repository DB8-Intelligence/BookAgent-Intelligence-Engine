/**
 * Entity: VideoPreset / MotionProfile / TransitionProfile
 *
 * Presets reutilizáveis de ritmo, transição e composição para vídeos.
 * Cada preset define um estilo visual consistente aplicável a qualquer output.
 *
 * Desacoplado do domínio — compatível com FFmpeg V1 e Shotstack futuro.
 *
 * Parte 63: Preset Engine
 */

import type { MusicMood } from './music.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Intensidade de movimento no vídeo */
export enum MotionIntensity {
  STATIC = 'static',     // Sem movimento — slides estáticos
  SUBTLE = 'subtle',     // Ken Burns suave, transições lentas
  DYNAMIC = 'dynamic',   // Movimento rápido, transições expressivas
}

/** Estilo de texto no vídeo */
export enum TextStyle {
  MINIMAL = 'minimal',       // Texto limpo, sem efeitos
  BOLD = 'bold',             // Texto grande, destaque forte
  ELEGANT = 'elegant',       // Tipografia refinada
  IMPACT = 'impact',         // Alto contraste, urgência
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/** Perfil de movimento — controla ritmo e animação por cena */
export interface MotionProfile {
  /** Duração padrão por cena (segundos) */
  defaultSceneDuration: number;

  /** Intensidade de movimento */
  intensity: MotionIntensity;

  /** Ken Burns zoom habilitado */
  kenBurnsEnabled: boolean;

  /** Fator de zoom Ken Burns (ex: 1.05 = 5% zoom) */
  kenBurnsZoomFactor: number;

  /** Velocidade de panning (pixels/segundo, 0 = sem panning) */
  panSpeed: number;
}

/** Perfil de transição — controla tipo e duração entre cenas */
export interface TransitionProfile {
  /** Tipo de transição padrão (alinhado com TransitionType do domínio) */
  defaultTransition: string;

  /** Duração da transição (segundos) */
  transitionDuration: number;

  /** Transições permitidas neste preset */
  allowedTransitions: string[];

  /** Se deve forçar o mesmo tipo em todas as cenas */
  forceUniform: boolean;
}

// ---------------------------------------------------------------------------
// VideoPreset
// ---------------------------------------------------------------------------

/**
 * Preset de vídeo — conjunto completo de defaults visuais.
 * Desacoplado do domínio, aplicável a qualquer output type.
 */
export interface VideoPreset {
  /** ID ��nico do preset */
  id: string;

  /** Nome legível */
  name: string;

  /** Descrição curta */
  description: string;

  /** Perfil de movimento */
  motion: MotionProfile;

  /** Perfil de transição */
  transition: TransitionProfile;

  /** Estilo de texto */
  textStyle: TextStyle;

  /** Mood de áudio padrão */
  defaultAudioMood: MusicMood;

  /** Cores sugeridas (override do branding se necessário) */
  suggestedColors?: {
    background?: string;
    text?: string;
    accent?: string;
  };

  /** Tags para matching com output types */
  tags: string[];
}
