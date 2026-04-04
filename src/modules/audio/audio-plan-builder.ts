/**
 * Audio Plan Builder
 *
 * Constrói AudioPlan a partir de MediaPlan + roteiro gerado.
 * Segmenta o texto em blocos de narração com timing e emoção.
 *
 * Suporta:
 * - Monólogo (uma voz, narração linear)
 * - Voiceover (narração sobre vídeo, sincronizado por cena)
 * - Podcast (duas vozes alternando, formato conversacional)
 */

import { v4 as uuid } from 'uuid';
import type { MediaPlan, MediaScene } from '../../domain/entities/media-plan.js';
import type { NarrativePlan } from '../../domain/entities/narrative.js';
import { ToneOfVoice, BeatRole } from '../../domain/entities/narrative.js';
import type { GeneratedMediaScript } from '../../generation/types.js';
import type {
  AudioPlan,
  AudioSegment,
  VoiceProfile,
  SoundtrackProfile,
} from '../../domain/entities/audio-plan.js';
import {
  NarrationMode,
  VoiceType,
  AudioEmotion,
  SoundtrackCategory,
} from '../../domain/entities/audio-plan.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Velocidade média de fala em português (palavras/segundo) */
const SPEECH_RATE_WPS = 2.5;

/** Pausa padrão entre segmentos (segundos) */
const DEFAULT_PAUSE = 0.5;

/** Pausa longa (entre seções/tópicos) */
const LONG_PAUSE = 1.2;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Constrói AudioPlan para um MediaPlan com roteiro.
 * Modo de narração é determinado pelo formato de output.
 */
export function buildAudioPlan(
  mediaPlan: MediaPlan,
  script: GeneratedMediaScript,
  tone: ToneOfVoice,
): AudioPlan {
  const mode = inferNarrationMode(mediaPlan.format);
  const voices = buildVoiceProfiles(mode, tone);
  const segments = buildSegments(script, mediaPlan, mode, voices);
  const soundtrack = buildSoundtrackProfile(mediaPlan.format, tone);
  const totalWords = segments.reduce((sum, s) => sum + countWords(s.text), 0);
  const totalDuration = segments.reduce(
    (sum, s) => sum + s.estimatedDurationSeconds + s.pauseAfterSeconds,
    0,
  );

  return {
    id: uuid(),
    sourcePlanId: mediaPlan.id,
    outputFormat: mediaPlan.format,
    narrationMode: mode,
    title: mediaPlan.title,
    voices,
    segments,
    soundtrack,
    totalDurationSeconds: Math.round(totalDuration),
    totalWords,
  };
}

/**
 * Constrói AudioPlan para um NarrativePlan de áudio puro (monólogo/podcast).
 */
export function buildAudioOnlyPlan(
  narrative: NarrativePlan,
  projectName: string,
): AudioPlan {
  const isPodcast = narrative.narrativeType === 'audio-podcast';
  const mode = isPodcast ? NarrationMode.PODCAST : NarrationMode.MONOLOGUE;
  const tone = narrative.tone;
  const voices = buildVoiceProfiles(mode, tone);
  const segments = buildSegmentsFromNarrative(narrative, mode, voices, projectName);
  const soundtrack = buildSoundtrackProfile(narrative.targetFormat, tone);
  const totalWords = segments.reduce((sum, s) => sum + countWords(s.text), 0);
  const totalDuration = segments.reduce(
    (sum, s) => sum + s.estimatedDurationSeconds + s.pauseAfterSeconds,
    0,
  );

  return {
    id: uuid(),
    sourcePlanId: narrative.id,
    outputFormat: narrative.targetFormat,
    narrationMode: mode,
    title: narrative.title,
    voices,
    segments,
    soundtrack,
    totalDurationSeconds: Math.round(totalDuration),
    totalWords,
  };
}

// ---------------------------------------------------------------------------
// Narration mode inference
// ---------------------------------------------------------------------------

function inferNarrationMode(format: string): NarrationMode {
  switch (format) {
    case 'audio_podcast': return NarrationMode.PODCAST;
    case 'audio_monologue': return NarrationMode.MONOLOGUE;
    case 'reel':
    case 'story':
    case 'video_long':
      return NarrationMode.VOICEOVER;
    default:
      return NarrationMode.MONOLOGUE;
  }
}

// ---------------------------------------------------------------------------
// Voice profiles
// ---------------------------------------------------------------------------

function buildVoiceProfiles(mode: NarrationMode, tone: ToneOfVoice): VoiceProfile[] {
  const primary = resolveVoice(tone, 'primary');
  if (mode !== NarrationMode.PODCAST && mode !== NarrationMode.DIALOGUE) {
    return [primary];
  }

  const secondary = resolveVoice(tone, 'secondary');
  return [primary, secondary];
}

function resolveVoice(tone: ToneOfVoice, role: 'primary' | 'secondary'): VoiceProfile {
  if (role === 'secondary') {
    return {
      id: 'voice-secondary',
      label: 'Convidado',
      voiceType: VoiceType.FEMALE_CASUAL,
      speed: 1.0,
      pitch: 0,
    };
  }

  // Primary voice based on tone
  switch (tone) {
    case ToneOfVoice.ASPIRACIONAL:
      return { id: 'voice-primary', label: 'Narrador', voiceType: VoiceType.MALE_DEEP, speed: 0.95, pitch: -3 };
    case ToneOfVoice.INFORMATIVO:
      return { id: 'voice-primary', label: 'Apresentador', voiceType: VoiceType.MALE_PROFESSIONAL, speed: 1.0, pitch: 0 };
    case ToneOfVoice.EMOCIONAL:
      return { id: 'voice-primary', label: 'Narrador', voiceType: VoiceType.FEMALE_WARM, speed: 0.95, pitch: 2 };
    case ToneOfVoice.URGENTE:
      return { id: 'voice-primary', label: 'Apresentador', voiceType: VoiceType.MALE_PROFESSIONAL, speed: 1.1, pitch: 2 };
    case ToneOfVoice.CONVERSACIONAL:
      return { id: 'voice-primary', label: 'Apresentador', voiceType: VoiceType.MALE_CASUAL, speed: 1.05, pitch: 0 };
    case ToneOfVoice.INSTITUCIONAL:
      return { id: 'voice-primary', label: 'Narrador Institucional', voiceType: VoiceType.MALE_DEEP, speed: 0.9, pitch: -5 };
    default:
      return { id: 'voice-primary', label: 'Narrador', voiceType: VoiceType.MALE_PROFESSIONAL, speed: 1.0, pitch: 0 };
  }
}

// ---------------------------------------------------------------------------
// Segment builders
// ---------------------------------------------------------------------------

function buildSegments(
  script: GeneratedMediaScript,
  mediaPlan: MediaPlan,
  mode: NarrationMode,
  voices: VoiceProfile[],
): AudioSegment[] {
  const segments: AudioSegment[] = [];
  const primaryVoice = voices[0];

  for (const sceneScript of script.scenes) {
    const scene = mediaPlan.scenes.find((s) => s.order === sceneScript.order);
    const text = sceneScript.narration || sceneScript.headline;
    if (!text || text.trim().length === 0) continue;

    const words = countWords(text);
    const speakDuration = words / (SPEECH_RATE_WPS * (primaryVoice.speed || 1.0));
    const emotion = resolveEmotion(sceneScript.role);
    const isLast = sceneScript.order === script.scenes.length - 1;
    const isFirst = sceneScript.order === 0;

    segments.push({
      order: segments.length,
      role: sceneScript.role,
      speakerId: primaryVoice.id,
      text,
      emotion,
      estimatedDurationSeconds: Math.round(speakDuration * 10) / 10,
      pauseAfterSeconds: isLast ? 0 : isTransitionPause(sceneScript.role) ? LONG_PAUSE : DEFAULT_PAUSE,
      fadeInMusic: isFirst,
      fadeOutMusic: isLast,
      sceneId: scene?.id,
    });
  }

  return segments;
}

function buildSegmentsFromNarrative(
  narrative: NarrativePlan,
  mode: NarrationMode,
  voices: VoiceProfile[],
  projectName: string,
): AudioSegment[] {
  const segments: AudioSegment[] = [];
  const isPodcast = mode === NarrationMode.PODCAST;

  for (let i = 0; i < narrative.beats.length; i++) {
    const beat = narrative.beats[i];
    const text = beat.briefing || beat.suggestedHeadline || '';
    if (!text || text.trim().length < 5) continue;

    // Alternate speakers for podcast mode
    const speakerIdx = isPodcast ? (i % 2) : 0;
    const voice = voices[speakerIdx] ?? voices[0];
    const words = countWords(text);
    const speakDuration = words / (SPEECH_RATE_WPS * (voice.speed || 1.0));
    const emotion = resolveEmotion(beat.role);
    const isLast = i === narrative.beats.length - 1;
    const isFirst = i === 0;

    // For podcast, add speaker introduction at first segment
    if (isPodcast && isFirst) {
      segments.push({
        order: 0,
        role: 'intro',
        speakerId: voices[0].id,
        text: `Olá, seja bem-vindo ao nosso podcast sobre o ${projectName}. Hoje vamos conhecer cada detalhe deste empreendimento.`,
        emotion: AudioEmotion.CONVERSATIONAL,
        estimatedDurationSeconds: 5,
        pauseAfterSeconds: LONG_PAUSE,
        fadeInMusic: true,
        fadeOutMusic: false,
      });
    }

    segments.push({
      order: segments.length,
      role: beat.role,
      speakerId: voice.id,
      text,
      emotion,
      estimatedDurationSeconds: Math.round(speakDuration * 10) / 10,
      pauseAfterSeconds: isLast ? 0 : isPodcast ? LONG_PAUSE : DEFAULT_PAUSE,
      fadeInMusic: false,
      fadeOutMusic: isLast,
    });
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Soundtrack
// ---------------------------------------------------------------------------

function buildSoundtrackProfile(format: string, tone: ToneOfVoice): SoundtrackProfile {
  const category = resolveSoundtrackCategory(format, tone);

  return {
    category,
    volume: category === SoundtrackCategory.NONE ? 0 : 0.15,
    fadeInDuration: 2,
    fadeOutDuration: 3,
  };
}

function resolveSoundtrackCategory(format: string, tone: ToneOfVoice): SoundtrackCategory {
  // Short video formats
  if (['reel', 'story'].includes(format)) {
    return tone === ToneOfVoice.ASPIRACIONAL ? SoundtrackCategory.AMBIENT_LUXURY
      : tone === ToneOfVoice.URGENTE ? SoundtrackCategory.ENERGETIC
        : SoundtrackCategory.UPBEAT_MODERN;
  }

  // Long video
  if (['video_long', 'presentation'].includes(format)) {
    return tone === ToneOfVoice.ASPIRACIONAL ? SoundtrackCategory.AMBIENT_LUXURY
      : tone === ToneOfVoice.INSTITUCIONAL ? SoundtrackCategory.CORPORATE
        : SoundtrackCategory.EMOTIONAL_PIANO;
  }

  // Podcast/monologue
  if (['audio_podcast', 'audio_monologue'].includes(format)) {
    return SoundtrackCategory.CHILL_LOFI;
  }

  return SoundtrackCategory.AMBIENT_LUXURY;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveEmotion(role: string): AudioEmotion {
  switch (role) {
    case BeatRole.HOOK: return AudioEmotion.ENTHUSIASTIC;
    case BeatRole.CONTEXT: return AudioEmotion.NEUTRAL;
    case BeatRole.SHOWCASE: return AudioEmotion.WARM;
    case BeatRole.LIFESTYLE: return AudioEmotion.WARM;
    case BeatRole.DIFFERENTIATOR: return AudioEmotion.ENTHUSIASTIC;
    case BeatRole.SOCIAL_PROOF: return AudioEmotion.SERIOUS;
    case BeatRole.INVESTMENT: return AudioEmotion.SERIOUS;
    case BeatRole.REINFORCEMENT: return AudioEmotion.WARM;
    case BeatRole.CLOSING: return AudioEmotion.WARM;
    case BeatRole.CTA: return AudioEmotion.URGENT;
    default: return AudioEmotion.NEUTRAL;
  }
}

function isTransitionPause(role: string): boolean {
  return [BeatRole.HOOK, BeatRole.CLOSING, BeatRole.CTA, 'intro'].includes(role as BeatRole);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
