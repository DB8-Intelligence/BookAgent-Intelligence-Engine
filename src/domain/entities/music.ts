/**
 * Entity: MusicTrack / MusicProfile / AudioMixConfig
 *
 * Estruturas para o Background Music Engine.
 *
 * - MusicTrack: trilha de áudio disponível no catálogo local
 * - MusicProfile: perfil de mood/tempo/intensidade para seleção
 * - AudioMixConfig: configuração de mixagem narração + música
 *
 * Parte 62: Background Music Engine
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Mood da trilha musical */
export enum MusicMood {
  LUXURY = 'luxury',
  UPBEAT = 'upbeat',
  CORPORATE = 'corporate',
  EMOTIONAL = 'emotional',
  ENERGETIC = 'energetic',
  CHILL = 'chill',
  DRAMATIC = 'dramatic',
  MINIMAL = 'minimal',
}

/** Faixa de tempo (BPM) */
export enum MusicTempo {
  SLOW = 'slow',           // < 80 BPM
  MODERATE = 'moderate',   // 80-120 BPM
  FAST = 'fast',           // > 120 BPM
}

/** Intensidade da trilha */
export enum MusicIntensity {
  LOW = 'low',             // Background sutil
  MEDIUM = 'medium',       // Presença moderada
  HIGH = 'high',           // Destaque energético
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/**
 * Trilha de áudio disponível no catálogo.
 * Arquivos locais em storage/music/{category}/{filename}.
 */
export interface MusicTrack {
  /** ID único da trilha */
  id: string;

  /** Nome legível da trilha */
  name: string;

  /** Caminho relativo no storage (ex: storage/music/luxury/ambient-01.mp3) */
  filePath: string;

  /** Duração em segundos */
  durationSeconds: number;

  /** Mood primário */
  mood: MusicMood;

  /** Tempo (BPM range) */
  tempo: MusicTempo;

  /** Intensidade */
  intensity: MusicIntensity;

  /** Tags adicionais para busca (ex: ['piano', 'strings', 'lofi']) */
  tags: string[];

  /** Se a trilha suporta loop contínuo */
  loopable: boolean;
}

/**
 * Perfil de música desejado para um output.
 * Usado pelo MusicSelector para encontrar a trilha ideal.
 */
export interface MusicProfile {
  /** Mood desejado */
  mood: MusicMood;

  /** Tempo desejado */
  tempo: MusicTempo;

  /** Intensidade desejada */
  intensity: MusicIntensity;

  /** Duração mínima necessária (segundos) */
  minDurationSeconds?: number;

  /** Se deve preferir trilhas loopáveis */
  preferLoopable?: boolean;
}

/**
 * Configuração de mixagem de áudio (narração + música de fundo).
 */
export interface AudioMixConfig {
  /** Volume da música de fundo (0.0 a 1.0, default: 0.15) */
  musicVolume: number;

  /** Volume da narração (0.0 a 1.0, default: 1.0) */
  narrationVolume: number;

  /** Ducking: redução de volume da música quando há voz (dB, default: -10) */
  duckingDb: number;

  /** Duração do fade-in da música (segundos) */
  fadeInSeconds: number;

  /** Duração do fade-out da música (segundos) */
  fadeOutSeconds: number;

  /** Se a música deve iniciar antes da narração */
  musicLeadInSeconds: number;

  /** Se a música deve continuar após a narração */
  musicTailSeconds: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Configuração de mix padrão — voz prioridade, música sutil */
export const DEFAULT_MIX_CONFIG: AudioMixConfig = {
  musicVolume: 0.15,
  narrationVolume: 1.0,
  duckingDb: -10,
  fadeInSeconds: 2,
  fadeOutSeconds: 3,
  musicLeadInSeconds: 1,
  musicTailSeconds: 2,
};
