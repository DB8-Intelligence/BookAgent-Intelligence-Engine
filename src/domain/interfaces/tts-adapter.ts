/**
 * Interface: ITTSAdapter
 *
 * Contrato para adapters de Text-to-Speech.
 * Permite trocar providers (OpenAI TTS, ElevenLabs, Google TTS)
 * sem modificar módulos.
 */

export interface ITTSAdapter {
  /** Nome do provider (ex: "openai-tts", "elevenlabs") */
  readonly provider: string;

  /** Gera áudio a partir de texto */
  synthesize(text: string, options?: TTSOptions): Promise<TTSResult>;

  /** Lista vozes disponíveis */
  listVoices(): Promise<TTSVoice[]>;
}

export interface TTSOptions {
  /** ID ou nome da voz */
  voice?: string;

  /** Velocidade de fala (0.5 a 2.0, default 1.0) */
  speed?: number;

  /** Formato do áudio (mp3, wav, opus) */
  format?: 'mp3' | 'wav' | 'opus';

  /** Modelo a usar (quando o provider tem múltiplos) */
  model?: string;
}

export interface TTSResult {
  /** Buffer do áudio gerado */
  audioBuffer: Buffer;

  /** Formato do áudio */
  format: string;

  /** Duração estimada em segundos */
  durationSeconds: number;

  /** Caracteres processados */
  characterCount: number;
}

export interface TTSVoice {
  /** ID da voz no provider */
  id: string;

  /** Nome legível da voz */
  name: string;

  /** Gênero */
  gender: 'male' | 'female' | 'neutral';

  /** Idioma principal */
  locale: string;
}
