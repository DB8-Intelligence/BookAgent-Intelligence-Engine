/**
 * Adapter: Gemini (Google AI)
 *
 * Implementação de IAIAdapter para modelos Google Gemini:
 * - Gemini Pro (geração de texto)
 * - Gemini Pro Vision (análise de imagens)
 * - Análise multimodal de documentos
 */

import type { IAIAdapter, AITextOptions } from '../../../domain/interfaces/ai-adapter.js';

export class GeminiAdapter implements IAIAdapter {
  readonly provider = 'gemini';

  async generateText(prompt: string, options?: AITextOptions): Promise<string> {
    // TODO: Implementar chamada à Gemini API
    throw new Error('Gemini adapter not implemented');
  }

  async analyzeImage(imagePath: string, prompt: string): Promise<string> {
    // TODO: Implementar Gemini Vision
    throw new Error('Gemini vision not implemented');
  }
}
