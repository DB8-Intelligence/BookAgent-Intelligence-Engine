/**
 * Adapter: Anthropic (Claude)
 *
 * Implementação de IAIAdapter para modelos Anthropic Claude:
 * - Claude Sonnet/Opus (geração de texto)
 * - Claude Vision (análise de imagens)
 *
 * Usa a API HTTP da Anthropic diretamente (sem SDK adicional).
 * Requer ANTHROPIC_API_KEY no environment.
 */

import { readFile } from 'node:fs/promises';
import type { IAIAdapter, AITextOptions } from '../../../domain/interfaces/ai-adapter.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 1024;
const API_URL = 'https://api.anthropic.com/v1/messages';

export class AnthropicAdapter implements IAIAdapter {
  readonly provider = 'anthropic';
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.model = model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  }

  async generateText(prompt: string, options?: AITextOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error('[AnthropicAdapter] ANTHROPIC_API_KEY not set');
    }

    const messages: Array<{ role: string; content: string }> = [
      { role: 'user', content: prompt },
    ];

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages,
    };

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    if (options?.systemPrompt) {
      body.system = options.systemPrompt;
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `[AnthropicAdapter] API error ${response.status}: ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };

    const textBlock = data.content.find(b => b.type === 'text');
    return textBlock?.text ?? '';
  }

  async analyzeImage(imagePath: string, prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('[AnthropicAdapter] ANTHROPIC_API_KEY not set');
    }

    // Ler imagem e converter para base64
    const imageBuffer = await readFile(imagePath);
    const base64 = imageBuffer.toString('base64');

    // Detectar media type
    const ext = imagePath.split('.').pop()?.toLowerCase();
    const mediaType = ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
      : ext === 'gif' ? 'image/gif'
      : 'image/jpeg';

    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64,
            },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ];

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: DEFAULT_MAX_TOKENS,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `[AnthropicAdapter] Vision API error ${response.status}: ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };

    const textBlock = data.content.find(b => b.type === 'text');
    return textBlock?.text ?? '';
  }
}
