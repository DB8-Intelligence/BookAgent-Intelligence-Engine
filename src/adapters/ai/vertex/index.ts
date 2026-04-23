/**
 * Adapter: Vertex AI (Google Cloud Enterprise Gemini)
 *
 * Implementação de IAIAdapter usando o SDK oficial @google-cloud/vertexai
 * com autenticação via Service Account (enterprise) em vez de API Key.
 *
 * Diferença do Gemini adapter (API pública):
 *   - Auth: Application Default Credentials (Service Account JSON ou Workload Identity)
 *   - Billing: unificado com GCP (não API key separada)
 *   - Data residency: escolhe região (us-central1, southamerica-east1, etc.)
 *   - Quotas: corporate (muito maiores que API pública)
 *   - Multimodal: otimizado para PDFs grandes com muitas imagens
 *
 * Configuração:
 *   GOOGLE_CLOUD_PROJECT=bookagent-enterprise
 *   GOOGLE_CLOUD_LOCATION=us-central1
 *   VERTEX_AI_MODEL_ID=gemini-2.0-flash-001
 *   VERTEX_AI_CREATIVE_MODEL=gemini-1.5-pro-002  (optional, for analyzeMultimodal)
 *
 * Auth (order of precedence):
 *   1. GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json  (local dev)
 *   2. Workload Identity (quando rodando em Cloud Run / GKE)
 *   3. gcloud auth application-default login (dev local alternativo)
 *
 * Referência: https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference
 */

import { readFile } from 'node:fs/promises';
import { VertexAI, type GenerativeModel, type Part } from '@google-cloud/vertexai';
import type { IAIAdapter, AITextOptions } from '../../../domain/interfaces/ai-adapter.js';

const DEFAULT_MODEL = 'gemini-2.0-flash-001';
const DEFAULT_CREATIVE_MODEL = 'gemini-1.5-pro-002';
const DEFAULT_LOCATION = 'us-central1';
const DEFAULT_MAX_TOKENS = 1024;

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class VertexAdapter implements IAIAdapter {
  readonly provider = 'vertex';
  private readonly vertex: VertexAI;
  private readonly fastModel: GenerativeModel;
  private readonly creativeModel: GenerativeModel;

  constructor(opts?: {
    project?: string;
    location?: string;
    model?: string;
    creativeModel?: string;
  }) {
    const project = opts?.project ?? process.env.GOOGLE_CLOUD_PROJECT ?? '';
    const location = opts?.location ?? process.env.GOOGLE_CLOUD_LOCATION ?? DEFAULT_LOCATION;
    const modelId = opts?.model ?? process.env.VERTEX_AI_MODEL_ID ?? DEFAULT_MODEL;
    const creativeId = opts?.creativeModel ?? process.env.VERTEX_AI_CREATIVE_MODEL ?? DEFAULT_CREATIVE_MODEL;

    if (!project) {
      throw new Error(
        '[VertexAdapter] GOOGLE_CLOUD_PROJECT not set. ' +
        'Required for Vertex AI auth via Service Account.',
      );
    }

    // SDK auto-loads credentials from:
    //   GOOGLE_APPLICATION_CREDENTIALS env var (file path to JSON key)
    //   OR Workload Identity (Cloud Run, GKE)
    //   OR gcloud auth application-default login (local dev)
    this.vertex = new VertexAI({ project, location });

    // Fast model: extraction, classification, routing (gemini-flash)
    this.fastModel = this.vertex.getGenerativeModel({ model: modelId });

    // Creative model: storytelling, long-form generation (gemini-pro)
    this.creativeModel = this.vertex.getGenerativeModel({ model: creativeId });
  }

  // -------------------------------------------------------------------------
  // generateText — uses fast model by default, switches to creative
  // when prompt is long or tone indicates creative work
  // -------------------------------------------------------------------------

  async generateText(prompt: string, options?: AITextOptions): Promise<string> {
    const model = this.pickModel(prompt, options);

    const request = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }] satisfies Part[],
        },
      ],
      generationConfig: {
        maxOutputTokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: options?.temperature ?? 0.7,
      },
      systemInstruction: options?.systemPrompt
        ? { role: 'system', parts: [{ text: options.systemPrompt }] satisfies Part[] }
        : undefined,
    };

    try {
      const result = await model.generateContent(request);
      const response = result.response;
      const text = response.candidates?.[0]?.content?.parts
        ?.map((p: Part) => ('text' in p ? (p.text as string) : ''))
        .join('') ?? '';

      if (!text) {
        throw new Error('[VertexAdapter] Empty response from Vertex AI');
      }

      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[VertexAdapter] generateText failed: ${msg}`);
    }
  }

  // -------------------------------------------------------------------------
  // analyzeImage — IAIAdapter contract (reads from disk path)
  // -------------------------------------------------------------------------

  async analyzeImage(imagePath: string, prompt: string): Promise<string> {
    const buf = await readFile(imagePath);
    const ext = imagePath.split('.').pop()?.toLowerCase();
    const mimeType = ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
      : ext === 'gif' ? 'image/gif'
      : 'image/jpeg';

    return this.analyzeMultimodal(buf, prompt, mimeType);
  }

  // -------------------------------------------------------------------------
  // analyzeMultimodal — raw bytes + prompt, for PDF/image processing
  // Exposed as its own method for the heavy multimodal pipeline to call
  // directly without touching disk (e.g. PDF page already in memory).
  // -------------------------------------------------------------------------

  async analyzeMultimodal(
    imageBytes: Buffer,
    prompt: string,
    mimeType: string = 'image/jpeg',
  ): Promise<string> {
    const base64 = imageBytes.toString('base64');

    const request = {
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: prompt },
          ] satisfies Part[],
        },
      ],
      generationConfig: {
        maxOutputTokens: DEFAULT_MAX_TOKENS * 2, // multimodal needs more
        temperature: 0.4,
      },
    };

    try {
      // Multimodal always uses the creative model (better vision reasoning)
      const result = await this.creativeModel.generateContent(request);
      const response = result.response;
      const text = response.candidates?.[0]?.content?.parts
        ?.map((p: Part) => ('text' in p ? (p.text as string) : ''))
        .join('') ?? '';

      if (!text) {
        throw new Error('[VertexAdapter] Empty multimodal response');
      }

      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[VertexAdapter] analyzeMultimodal failed: ${msg}`);
    }
  }

  // -------------------------------------------------------------------------
  // Heuristic: pick fast vs creative model
  // -------------------------------------------------------------------------

  private pickModel(prompt: string, options?: AITextOptions): GenerativeModel {
    // Explicit max tokens hint — large output = creative work
    if ((options?.maxTokens ?? 0) > 2000) return this.creativeModel;
    // High temperature = creative/aspirational tone
    if ((options?.temperature ?? 0.7) > 0.8) return this.creativeModel;
    // Long prompt = probably narrative/storytelling context
    if (prompt.length > 3000) return this.creativeModel;
    return this.fastModel;
  }
}
