/**
 * Adapter: ElevenLabs TTS
 *
 * Implementação de ITTSAdapter para ElevenLabs Text-to-Speech.
 * Usa a API v1 da ElevenLabs diretamente (sem SDK adicional).
 * Requer ELEVENLABS_API_KEY no environment.
 *
 * Modelo padrão: eleven_multilingual_v2
 * Suporte nativo a português brasileiro.
 *
 * Vozes padrão mapeadas por VoiceType:
 * - MALE_DEEP: Adam (pNInz6obpgDQGcFmaJgB)
 * - MALE_PROFESSIONAL: Arnold (VR6AewLTigWG4xSOukaG)
 * - MALE_CASUAL: Antoni (ErXwobaYiN019PkySvjV)
 * - FEMALE_WARM: Bella (EXAVITQu4vr4xnSDxMaL)
 * - FEMALE_PROFESSIONAL: Rachel (21m00Tcm4TlvDq8ikWAM)
 * - FEMALE_CASUAL: Domi (AZnzlk1XvdvUeBnXmlld)
 */

import type {
  ITTSAdapter,
  TTSOptions,
  TTSResult,
  TTSVoice,
} from '../../../domain/interfaces/tts-adapter.js';

const API_BASE = 'https://api.elevenlabs.io/v1';
const DEFAULT_MODEL = 'eleven_multilingual_v2';
const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam
const WORDS_PER_SECOND = 2.5;

/** Vozes ElevenLabs com metadata */
const ELEVENLABS_VOICES: TTSVoice[] = [
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'male', locale: 'pt-BR' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', gender: 'male', locale: 'pt-BR' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'male', locale: 'pt-BR' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', gender: 'female', locale: 'pt-BR' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'female', locale: 'pt-BR' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', gender: 'female', locale: 'pt-BR' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', gender: 'female', locale: 'pt-BR' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', gender: 'male', locale: 'pt-BR' },
];

/** Mapeamento VoiceType → ElevenLabs voice ID (fallback para vozes padrão) */
const VOICE_TYPE_MAP: Record<string, string> = {
  'male-deep': 'pNInz6obpgDQGcFmaJgB',         // Adam
  'male-professional': 'VR6AewLTigWG4xSOukaG',   // Arnold
  'male-casual': 'ErXwobaYiN019PkySvjV',          // Antoni
  'female-warm': 'EXAVITQu4vr4xnSDxMaL',         // Bella
  'female-professional': '21m00Tcm4TlvDq8ikWAM',  // Rachel
  'female-casual': 'AZnzlk1XvdvUeBnXmlld',        // Domi
};

export class ElevenLabsAdapter implements ITTSAdapter {
  readonly provider = 'elevenlabs';
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? process.env.ELEVENLABS_API_KEY ?? '';
    this.model = model ?? process.env.ELEVENLABS_MODEL ?? DEFAULT_MODEL;
  }

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    if (!this.apiKey) {
      throw new Error('[ElevenLabsAdapter] ELEVENLABS_API_KEY not set');
    }

    // Resolve voice ID: env override → voice type mapping → options.voice → default
    const voiceId = process.env.ELEVENLABS_VOICE_ID
      ?? (options?.voice ? (VOICE_TYPE_MAP[options.voice] ?? options.voice) : null)
      ?? DEFAULT_VOICE_ID;

    const format = options?.format ?? 'mp3';
    const outputFormat = format === 'wav' ? 'pcm_44100' : 'mp3_44100_128';

    const body = {
      text,
      model_id: this.model,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.4,
        use_speaker_boost: true,
      },
    };

    const url = `${API_BASE}/text-to-speech/${voiceId}?output_format=${outputFormat}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': this.apiKey,
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `[ElevenLabsAdapter] API error ${response.status}: ${errorText}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // Estimar duração pela contagem de palavras
    const wordCount = text.split(/\s+/).length;
    const speed = options?.speed ?? 1.0;
    const durationSeconds = Math.round(wordCount / (WORDS_PER_SECOND * speed));

    return {
      audioBuffer,
      format: 'mp3',
      durationSeconds,
      characterCount: text.length,
    };
  }

  async listVoices(): Promise<TTSVoice[]> {
    return ELEVENLABS_VOICES;
  }

  /**
   * Retorna o voice ID ElevenLabs para um VoiceType do sistema.
   * Útil para mapear VoiceProfile.voiceType → providerVoiceId.
   */
  static resolveVoiceId(voiceType: string): string {
    return VOICE_TYPE_MAP[voiceType] ?? DEFAULT_VOICE_ID;
  }
}
