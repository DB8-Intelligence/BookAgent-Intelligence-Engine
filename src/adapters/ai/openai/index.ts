/**
 * Adapter: OpenAI
 *
 * Implementação de IAIAdapter para modelos OpenAI:
 * - GPT-4o / GPT-4o-mini (geração de texto)
 * - GPT-4 Vision (análise de imagens)
 *
 * Usa a API HTTP da OpenAI diretamente (sem SDK adicional).
 * Requer OPENAI_API_KEY no environment.
 */

import { readFile } from 'node:fs/promises';
import type { IAIAdapter, AITextOptions } from '../../../domain/interfaces/ai-adapter.js';

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_MAX_TOKENS = 1024;
const API_URL = 'https://api.openai.com/v1/chat/completions';

export class OpenAIAdapter implements IAIAdapter {
  readonly provider = 'openai';
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.model = model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  }

  async generateText(prompt: string, options?: AITextOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error('[OpenAIAdapter] OPENAI_API_KEY not set');
    }

    const messages: Array<{ role: string; content: string }> = [];

    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: options?.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `[OpenAIAdapter] API error ${response.status}: ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    return data.choices[0]?.message?.content ?? '';
  }

  async analyzeImage(imagePath: string, prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('[OpenAIAdapter] OPENAI_API_KEY not set');
    }

    const imageBuffer = await readFile(imagePath);
    const base64 = imageBuffer.toString('base64');

    const ext = imagePath.split('.').pop()?.toLowerCase();
    const mediaType = ext === 'png' ? 'image/png' : 'image/jpeg';

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mediaType};base64,${base64}`,
                },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
        max_tokens: DEFAULT_MAX_TOKENS,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `[OpenAIAdapter] Vision API error ${response.status}: ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    return data.choices[0]?.message?.content ?? '';
  }
}
