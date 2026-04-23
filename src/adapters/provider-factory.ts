/**
 * Provider Factory
 *
 * Cria instâncias de adapters de IA e TTS com base em configuração.
 * Permite trocar providers sem modificar módulos do pipeline.
 *
 * Configuração via environment variables:
 * - AI_PROVIDER: "anthropic" | "openai" | "gemini" | "vertex" (default: "anthropic")
 * - TTS_PROVIDER: "openai-tts" | "elevenlabs" (default: "openai-tts")
 * - AI_GENERATION_MODE: "auto" | "ai" | "local" (default: "auto")
 * - ANTHROPIC_API_KEY, ANTHROPIC_MODEL: Claude
 * - OPENAI_API_KEY, OPENAI_MODEL: GPT-4o
 * - GEMINI_API_KEY, GEMINI_MODEL: Google Gemini (public API)
 * - GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, VERTEX_AI_MODEL_ID: Vertex AI (enterprise)
 *   Auth via GOOGLE_APPLICATION_CREDENTIALS (service account) or Workload Identity
 * - ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID: ElevenLabs TTS
 *
 * Uso:
 *   const ai = createAIAdapter();         // usa env vars
 *   const tts = createTTSAdapter();       // usa env vars
 *   const ai2 = tryCreateAIAdapter();     // null se sem API key
 *   const tts2 = tryCreateTTSAdapter();   // null se sem API key
 */

import type { IAIAdapter } from '../domain/interfaces/ai-adapter.js';
import type { ITTSAdapter } from '../domain/interfaces/tts-adapter.js';
import { AnthropicAdapter } from './ai/anthropic/index.js';
import { OpenAIAdapter } from './ai/openai/index.js';
import { GeminiAdapter } from './ai/gemini/index.js';
import { VertexAdapter } from './ai/vertex/index.js';
import { OpenAITTSAdapter } from './tts/openai/index.js';
import { ElevenLabsAdapter } from './tts/elevenlabs/index.js';

// ---------------------------------------------------------------------------
// AI Adapter factory
// ---------------------------------------------------------------------------

export type AIProviderName = 'anthropic' | 'openai' | 'gemini' | 'vertex';

/**
 * Cria um adapter de IA com base no provider especificado.
 * Se não especificado, usa AI_PROVIDER do env (default: "anthropic").
 * Lança erro se a API key não estiver configurada.
 */
export function createAIAdapter(provider?: AIProviderName): IAIAdapter {
  const name = provider ?? (process.env.AI_PROVIDER as AIProviderName) ?? 'vertex';

  switch (name) {
    case 'anthropic':
      return new AnthropicAdapter();
    case 'openai':
      return new OpenAIAdapter();
    case 'gemini':
      return new GeminiAdapter();
    case 'vertex':
      return new VertexAdapter();
    default:
      throw new Error(`[ProviderFactory] Unknown AI provider: ${name}`);
  }
}

/**
 * Tenta criar um adapter de IA. Retorna null se a API key não estiver configurada.
 * Ideal para graceful degradation: sem key → usa geração local.
 */
export function tryCreateAIAdapter(provider?: AIProviderName): IAIAdapter | null {
  const name = provider ?? (process.env.AI_PROVIDER as AIProviderName) ?? 'vertex';

  switch (name) {
    case 'anthropic':
      if (!process.env.ANTHROPIC_API_KEY) return null;
      return new AnthropicAdapter();
    case 'openai':
      if (!process.env.OPENAI_API_KEY) return null;
      return new OpenAIAdapter();
    case 'gemini':
      if (!process.env.GEMINI_API_KEY) return null;
      return new GeminiAdapter();
    case 'vertex':
      // Vertex uses Service Account (GOOGLE_APPLICATION_CREDENTIALS or
      // Workload Identity), not an API key. Availability is inferred from
      // GOOGLE_CLOUD_PROJECT being set.
      if (!process.env.GOOGLE_CLOUD_PROJECT) return null;
      try {
        return new VertexAdapter();
      } catch {
        return null;
      }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// TTS Adapter factory
// ---------------------------------------------------------------------------

export type TTSProviderName = 'openai-tts' | 'elevenlabs';

/**
 * Cria um adapter de TTS com base no provider especificado.
 * Se não especificado, usa TTS_PROVIDER do env (default: "openai-tts").
 * Lança erro se a API key não estiver configurada.
 */
export function createTTSAdapter(provider?: TTSProviderName): ITTSAdapter {
  const name = provider ?? (process.env.TTS_PROVIDER as TTSProviderName) ?? 'openai-tts';

  switch (name) {
    case 'openai-tts':
      return new OpenAITTSAdapter();
    case 'elevenlabs':
      return new ElevenLabsAdapter();
    default:
      throw new Error(`[ProviderFactory] Unknown TTS provider: ${name}`);
  }
}

/**
 * Tenta criar um adapter de TTS. Retorna null se a API key não estiver configurada.
 * Ideal para graceful degradation: sem key → pula síntese de áudio.
 */
export function tryCreateTTSAdapter(provider?: TTSProviderName): ITTSAdapter | null {
  const name = provider ?? (process.env.TTS_PROVIDER as TTSProviderName) ?? 'openai-tts';

  switch (name) {
    case 'openai-tts':
      if (!process.env.OPENAI_API_KEY) return null;
      return new OpenAITTSAdapter();
    case 'elevenlabs':
      if (!process.env.ELEVENLABS_API_KEY) return null;
      return new ElevenLabsAdapter();
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Status check
// ---------------------------------------------------------------------------

export interface ProviderStatus {
  ai: {
    provider: string;
    available: boolean;
    mode: string;
    availableProviders: string[];
  };
  tts: { provider: string; available: boolean; synthesisEnabled: boolean };
}

/**
 * Retorna o status de disponibilidade de todos os providers configurados.
 * Útil para health checks e diagnóstico.
 * Reflete todos os providers com API key, não apenas o padrão (AI_PROVIDER).
 */
export function checkProviderStatus(): ProviderStatus {
  const aiProvider = (process.env.AI_PROVIDER as AIProviderName) ?? 'vertex';
  const ttsProvider = (process.env.TTS_PROVIDER as TTSProviderName) ?? 'openai-tts';
  const aiMode = process.env.AI_GENERATION_MODE ?? 'auto';

  // Quais providers têm chaves configuradas
  const availableProviders: string[] = [];
  if (process.env.ANTHROPIC_API_KEY)     availableProviders.push('anthropic');
  if (process.env.OPENAI_API_KEY)        availableProviders.push('openai');
  if (process.env.GEMINI_API_KEY)        availableProviders.push('gemini');
  if (process.env.GOOGLE_CLOUD_PROJECT)  availableProviders.push('vertex');

  const aiAvailable = availableProviders.length > 0;

  const ttsAvailable =
    (ttsProvider === 'openai-tts' && !!process.env.OPENAI_API_KEY) ||
    (ttsProvider === 'elevenlabs' && !!process.env.ELEVENLABS_API_KEY);

  const synthesisEnabled = process.env.TTS_SYNTHESIS_ENABLED === 'true';

  return {
    ai: { provider: aiProvider, available: aiAvailable, mode: aiMode, availableProviders },
    tts: { provider: ttsProvider, available: ttsAvailable, synthesisEnabled },
  };
}
