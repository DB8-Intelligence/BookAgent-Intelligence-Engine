/**
 * Entity: AudioPlan / AudioSegment
 *
 * Plano de áudio estruturado para outputs narrados.
 * Define a sequência de blocos de narração, tipo de voz,
 * timing e trilha sonora associada.
 *
 * Consumido por adapters de TTS (ElevenLabs, Google TTS, etc.)
 * e pelo video renderer para sincronização.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Modo de narração */
export enum NarrationMode {
  MONOLOGUE = 'monologue',       // Uma voz, narração linear
  DIALOGUE = 'dialogue',          // Duas vozes alternando
  PODCAST = 'podcast',            // Formato conversacional
  VOICEOVER = 'voiceover',        // Narração sobre vídeo
}

/** Tipo de voz */
export enum VoiceType {
  MALE_PROFESSIONAL = 'male-professional',
  FEMALE_PROFESSIONAL = 'female-professional',
  MALE_CASUAL = 'male-casual',
  FEMALE_CASUAL = 'female-casual',
  MALE_DEEP = 'male-deep',
  FEMALE_WARM = 'female-warm',
}

/** Emoção/tom do segmento de áudio */
export enum AudioEmotion {
  NEUTRAL = 'neutral',
  ENTHUSIASTIC = 'enthusiastic',
  SERIOUS = 'serious',
  WARM = 'warm',
  URGENT = 'urgent',
  CONVERSATIONAL = 'conversational',
}

/** Categoria de trilha sonora */
export enum SoundtrackCategory {
  NONE = 'none',
  AMBIENT_LUXURY = 'ambient-luxury',
  UPBEAT_MODERN = 'upbeat-modern',
  CORPORATE = 'corporate',
  EMOTIONAL_PIANO = 'emotional-piano',
  ENERGETIC = 'energetic',
  CHILL_LOFI = 'chill-lofi',
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** Segmento atômico de áudio */
export interface AudioSegment {
  /** Ordem na sequência */
  order: number;

  /** Papel narrativo (alinhado com BeatRole) */
  role: string;

  /** Speaker ID (para multi-voz) */
  speakerId: string;

  /** Texto a ser narrado (TTS input) */
  text: string;

  /** Emoção/tom deste segmento */
  emotion: AudioEmotion;

  /** Duração estimada em segundos */
  estimatedDurationSeconds: number;

  /** Pausa após este segmento (em segundos) */
  pauseAfterSeconds: number;

  /** Se deve aplicar fade-in de trilha */
  fadeInMusic: boolean;

  /** Se deve aplicar fade-out de trilha */
  fadeOutMusic: boolean;

  /** ID da cena de vídeo correspondente (para sync) */
  sceneId?: string;
}

/** Perfil de voz para um speaker */
export interface VoiceProfile {
  /** ID do speaker */
  id: string;

  /** Nome/label do speaker */
  label: string;

  /** Tipo de voz */
  voiceType: VoiceType;

  /** ID de voz no provider TTS (ElevenLabs, Google, etc.) */
  providerVoiceId?: string;

  /** Velocidade de fala (1.0 = normal, 0.8-1.2 range) */
  speed: number;

  /** Pitch adjustment (-20 a +20) */
  pitch: number;
}

/** Perfil de trilha sonora */
export interface SoundtrackProfile {
  /** Categoria da trilha */
  category: SoundtrackCategory;

  /** Volume da trilha (0-1, tipicamente 0.1-0.3 para background) */
  volume: number;

  /** Fade-in no início (segundos) */
  fadeInDuration: number;

  /** Fade-out no final (segundos) */
  fadeOutDuration: number;

  /** Caminho do arquivo de trilha (se disponível) */
  trackPath?: string;

  /** URL de trilha (para referência futura) */
  trackUrl?: string;
}

/** Plano de áudio completo */
export interface AudioPlan {
  /** ID único */
  id: string;

  /** ID do MediaPlan ou NarrativePlan de origem */
  sourcePlanId: string;

  /** Formato de output (reel, video_long, podcast, etc.) */
  outputFormat: string;

  /** Modo de narração */
  narrationMode: NarrationMode;

  /** Título do áudio */
  title: string;

  /** Speakers envolvidos */
  voices: VoiceProfile[];

  /** Sequência de segmentos de áudio */
  segments: AudioSegment[];

  /** Perfil de trilha sonora */
  soundtrack: SoundtrackProfile;

  /** Duração total estimada em segundos */
  totalDurationSeconds: number;

  /** Contagem total de palavras */
  totalWords: number;
}

/** Resultado da geração de áudio */
export interface AudioGenerationResult {
  /** Planos de áudio gerados */
  plans: AudioPlan[];

  /** Total de segmentos */
  totalSegments: number;

  /** Duração total estimada */
  totalDurationSeconds: number;
}
