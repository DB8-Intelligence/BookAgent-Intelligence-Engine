/**
 * Adapter: Gemini (Google Generative AI)
 *
 * Implementação de IAIAdapter para modelos Google Gemini:
 * - Gemini 2.0 Flash / 1.5 Flash (geração de texto)
 * - Gemini Vision (análise de imagens com inlineData)
 *
 * Usa a API v1beta do Google Generative Language diretamente (sem SDK).
 * Requer GEMINI_API_KEY no environment.
 *
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}
 */

import { readFile } from 'node:fs/promises';
import type { IAIAdapter, AITextOptions } from '../../../domain/interfaces/ai-adapter.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.0-flash';
const DEFAULT_MAX_TOKENS = 1024;

// ---------------------------------------------------------------------------
// Types (Gemini API shapes)
// ---------------------------------------------------------------------------

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64
  };
}

interface GeminiContent {
  role?: string;
  parts: GeminiPart[];
}

interface GeminiRequest {
  systemInstruction?: { parts: GeminiPart[] };
  contents: GeminiContent[];
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
  };
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class GeminiAdapter implements IAIAdapter {
  readonly provider = 'gemini';
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? process.env.GEMINI_API_KEY ?? '';
    this.model = model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  }

  async generateText(prompt: string, options?: AITextOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error('[GeminiAdapter] GEMINI_API_KEY not set');
    }

    const body: GeminiRequest = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: options?.temperature ?? 0.7,
      },
    };

    if (options?.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: options.systemPrompt }],
      };
    }

    const url = `${API_BASE}/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `[GeminiAdapter] API error ${response.status}: ${errorText}`,
      );
    }

    const data = (await response.json()) as GeminiResponse;
    const firstCandidate = data.candidates[0];

    if (!firstCandidate?.content?.parts?.length) {
      throw new Error('[GeminiAdapter] Empty response from API');
    }

    return firstCandidate.content.parts.map((p) => p.text).join('');
  }

  async analyzeImage(imagePath: string, prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('[GeminiAdapter] GEMINI_API_KEY not set');
    }

    const imageBuffer = await readFile(imagePath);
    const base64 = imageBuffer.toString('base64');

    const ext = imagePath.split('.').pop()?.toLowerCase();
    const mimeType = ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
      : ext === 'gif' ? 'image/gif'
      : 'image/jpeg';

    const body: GeminiRequest = {
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: DEFAULT_MAX_TOKENS,
        temperature: 0.4,
      },
    };

    // Use a vision-capable model (gemini-2.0-flash supports multimodal)
    const visionModel = this.model.includes('flash') || this.model.includes('pro')
      ? this.model
      : 'gemini-2.0-flash';

    const url = `${API_BASE}/${visionModel}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `[GeminiAdapter] Vision API error ${response.status}: ${errorText}`,
      );
    }

    const data = (await response.json()) as GeminiResponse;
    const firstCandidate = data.candidates[0];

    if (!firstCandidate?.content?.parts?.length) {
      throw new Error('[GeminiAdapter] Empty vision response from API');
    }

    return firstCandidate.content.parts.map((p) => p.text).join('');
  }
}
