/**
 * Provider Factory
 *
 * Cria instâncias de adapters de IA e TTS com base em configuração.
 * Permite trocar providers sem modificar módulos do pipeline.
 *
 * Configuração via environment variables:
 * - AI_PROVIDER: "anthropic" | "openai" | "gemini" (default: "anthropic")
 * - TTS_PROVIDER: "openai-tts" (default: "openai-tts")
 * - ANTHROPIC_API_KEY, OPENAI_API_KEY: chaves de API
 * - ANTHROPIC_MODEL, OPENAI_MODEL: modelo a usar
 *
 * Uso:
 *   const ai = createAIAdapter();         // usa env vars
 *   const tts = createTTSAdapter();       // usa env vars
 *   const ai2 = createAIAdapter('openai'); // override explícito
 */

import type { IAIAdapter } from '../domain/interfaces/ai-adapter.js';
import type { ITTSAdapter } from '../domain/interfaces/tts-adapter.js';
import { AnthropicAdapter } from './ai/anthropic/index.js';
import { OpenAIAdapter } from './ai/openai/index.js';
import { GeminiAdapter } from './ai/gemini/index.js';
import { OpenAITTSAdapter } from './tts/openai/index.js';

// ---------------------------------------------------------------------------
// AI Adapter factory
// ---------------------------------------------------------------------------

export type AIProviderName = 'anthropic' | 'openai' | 'gemini';

/**
 * Cria um adapter de IA com base no provider especificado.
 * Se não especificado, usa AI_PROVIDER do env (default: "anthropic").
 */
export function createAIAdapter(provider?: AIProviderName): IAIAdapter {
  const name = provider ?? (process.env.AI_PROVIDER as AIProviderName) ?? 'anthropic';

  switch (name) {
    case 'anthropic':
      return new AnthropicAdapter();
    case 'openai':
      return new OpenAIAdapter();
    case 'gemini':
      return new GeminiAdapter();
    default:
      throw new Error(`[ProviderFactory] Unknown AI provider: ${name}`);
  }
}

/**
 * Tenta criar um adapter de IA. Retorna null se a API key não estiver configurada.
 * Útil para modo graceful degradation: se não há key, usa geração local.
 */
export function tryCreateAIAdapter(provider?: AIProviderName): IAIAdapter | null {
  const name = provider ?? (process.env.AI_PROVIDER as AIProviderName) ?? 'anthropic';

  switch (name) {
    case 'anthropic':
      if (!process.env.ANTHROPIC_API_KEY) return null;
      return new AnthropicAdapter();
    case 'openai':
      if (!process.env.OPENAI_API_KEY) return null;
      return new OpenAIAdapter();
    case 'gemini':
      // Gemini still a stub
      return null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// TTS Adapter factory
// ---------------------------------------------------------------------------

export type TTSProviderName = 'openai-tts';

/**
 * Cria um adapter de TTS com base no provider especificado.
 * Se não especificado, usa TTS_PROVIDER do env (default: "openai-tts").
 */
export function createTTSAdapter(provider?: TTSProviderName): ITTSAdapter {
  const name = provider ?? (process.env.TTS_PROVIDER as TTSProviderName) ?? 'openai-tts';

  switch (name) {
    case 'openai-tts':
      return new OpenAITTSAdapter();
    default:
      throw new Error(`[ProviderFactory] Unknown TTS provider: ${name}`);
  }
}

/**
 * Tenta criar um adapter de TTS. Retorna null se a API key não estiver configurada.
 */
export function tryCreateTTSAdapter(provider?: TTSProviderName): ITTSAdapter | null {
  const name = provider ?? (process.env.TTS_PROVIDER as TTSProviderName) ?? 'openai-tts';

  switch (name) {
    case 'openai-tts':
      if (!process.env.OPENAI_API_KEY) return null;
      return new OpenAITTSAdapter();
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Status check
// ---------------------------------------------------------------------------

export interface ProviderStatus {
  ai: { provider: string; available: boolean };
  tts: { provider: string; available: boolean };
}

/**
 * Retorna o status de disponibilidade dos providers configurados.
 */
export function checkProviderStatus(): ProviderStatus {
  const aiProvider = (process.env.AI_PROVIDER as AIProviderName) ?? 'anthropic';
  const ttsProvider = (process.env.TTS_PROVIDER as TTSProviderName) ?? 'openai-tts';

  const aiAvailable =
    (aiProvider === 'anthropic' && !!process.env.ANTHROPIC_API_KEY) ||
    (aiProvider === 'openai' && !!process.env.OPENAI_API_KEY) ||
    false;

  const ttsAvailable =
    (ttsProvider === 'openai-tts' && !!process.env.OPENAI_API_KEY) ||
    false;

  return {
    ai: { provider: aiProvider, available: aiAvailable },
    tts: { provider: ttsProvider, available: ttsAvailable },
  };
}
