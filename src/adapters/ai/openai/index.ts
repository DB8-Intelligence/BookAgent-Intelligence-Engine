/**
 * Adapter: OpenAI
 *
 * Implementação de IAIAdapter para modelos OpenAI:
 * - GPT-4 / GPT-4o (geração de texto)
 * - GPT-4 Vision (análise de imagens)
 * - TTS (text-to-speech)
 * - DALL-E (geração de imagens)
 */

import type { IAIAdapter, AITextOptions } from '../../../domain/interfaces/ai-adapter.js';

export class OpenAIAdapter implements IAIAdapter {
  readonly provider = 'openai';

  async generateText(prompt: string, options?: AITextOptions): Promise<string> {
    // TODO: Implementar chamada à OpenAI API
    throw new Error('OpenAI adapter not implemented');
  }

  async analyzeImage(imagePath: string, prompt: string): Promise<string> {
    // TODO: Implementar GPT-4 Vision
    throw new Error('OpenAI vision not implemented');
  }
}
