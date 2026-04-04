/**
 * Adapter: OpenAI TTS
 *
 * Implementação de ITTSAdapter para OpenAI Text-to-Speech.
 * Usa a API /v1/audio/speech da OpenAI.
 * Requer OPENAI_API_KEY no environment.
 *
 * Modelos disponíveis:
 * - tts-1: rápido, qualidade padrão
 * - tts-1-hd: mais lento, qualidade superior
 *
 * Vozes: alloy, echo, fable, onyx, nova, shimmer
 */

import type {
  ITTSAdapter,
  TTSOptions,
  TTSResult,
  TTSVoice,
} from '../../../domain/interfaces/tts-adapter.js';

const API_URL = 'https://api.openai.com/v1/audio/speech';
const DEFAULT_MODEL = 'tts-1';
const DEFAULT_VOICE = 'onyx';

/** Vozes OpenAI com metadata */
const OPENAI_VOICES: TTSVoice[] = [
  { id: 'alloy', name: 'Alloy', gender: 'neutral', locale: 'en-US' },
  { id: 'echo', name: 'Echo', gender: 'male', locale: 'en-US' },
  { id: 'fable', name: 'Fable', gender: 'neutral', locale: 'en-US' },
  { id: 'onyx', name: 'Onyx', gender: 'male', locale: 'en-US' },
  { id: 'nova', name: 'Nova', gender: 'female', locale: 'en-US' },
  { id: 'shimmer', name: 'Shimmer', gender: 'female', locale: 'en-US' },
];

/** Palavras por segundo para estimativa de duração */
const WORDS_PER_SECOND = 2.5;

export class OpenAITTSAdapter implements ITTSAdapter {
  readonly provider = 'openai-tts';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.OPENAI_API_KEY ?? '';
  }

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    if (!this.apiKey) {
      throw new Error('[OpenAITTSAdapter] OPENAI_API_KEY not set');
    }

    const voice = options?.voice ?? DEFAULT_VOICE;
    const model = options?.model ?? DEFAULT_MODEL;
    const format = options?.format ?? 'mp3';
    const speed = options?.speed ?? 1.0;

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: text,
        voice,
        response_format: format,
        speed,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `[OpenAITTSAdapter] API error ${response.status}: ${errorText}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // Estimar duração pela contagem de palavras
    const wordCount = text.split(/\s+/).length;
    const durationSeconds = Math.round(wordCount / (WORDS_PER_SECOND * speed));

    return {
      audioBuffer,
      format,
      durationSeconds,
      characterCount: text.length,
    };
  }

  async listVoices(): Promise<TTSVoice[]> {
    return OPENAI_VOICES;
  }
}
