/**
 * Gemini Semantic Client — JSON-first text wrapper
 *
 * Thin client que encapsula `GeminiAdapter.generateText()` para forçar
 * saída JSON estruturada. NÃO expõe `analyzeImage` — multimodal é
 * proibido nesta camada.
 *
 * Design:
 *  - Reusa o adapter existente em `src/adapters/ai/gemini/index.ts`
 *    (sem SDK externo, fetch direto à API v1beta do Google).
 *  - Aceita um `systemPrompt`, um `userPrompt` e uma função de
 *    validação — retorna o objeto parseado e validado.
 *  - Endurece o system prompt com regras de saída JSON estrita.
 *  - Extrai o primeiro objeto JSON da resposta, removendo code fences
 *    quando presentes (Gemini às vezes envolve em ```json).
 *  - Todas as falhas viram `GeminiSemanticError` com contexto.
 *
 * IMPORTANTE:
 *  - `generateJson<T>` nunca recebe imagens.
 *  - `temperature` default baixo (0.2) para maximizar determinismo.
 *  - `model` default: gemini-1.5-pro-latest (via env GEMINI_SEMANTIC_MODEL).
 */

import { GeminiAdapter } from '../../adapters/ai/gemini/index.js';
import { logger } from '../../utils/logger.js';

// ----------------------------------------------------------------------------
// Options & request shapes
// ----------------------------------------------------------------------------

export interface GeminiSemanticClientOptions {
  /** API key — default `process.env.GEMINI_API_KEY`. */
  readonly apiKey?: string;
  /** Modelo — default `process.env.GEMINI_SEMANTIC_MODEL` || `gemini-1.5-pro-latest`. */
  readonly model?: string;
}

export interface JsonPromptRequest {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  /** Default 0.2 — determinístico para classificação. */
  readonly temperature?: number;
  /** Default 1024. */
  readonly maxTokens?: number;
}

export class GeminiSemanticError extends Error {
  constructor(message: string, public readonly rawResponse?: string) {
    super(message);
    this.name = 'GeminiSemanticError';
  }
}

// ----------------------------------------------------------------------------
// Client
// ----------------------------------------------------------------------------

const DEFAULT_SEMANTIC_MODEL = 'gemini-1.5-pro-latest';

const JSON_RULES = [
  '',
  'OUTPUT RULES (strict):',
  '- Return ONLY a single valid JSON object. No prose before or after.',
  '- No markdown. No ```json fences. No explanation.',
  '- Field names must match the schema exactly (case sensitive).',
  '- All string values are UTF-8 plain text. No HTML, no markdown syntax inside values.',
  '- Numbers must be plain decimals (no quotes).',
  '- Arrays must use [] notation.',
  '- Do NOT include fields outside the schema.',
].join('\n');

export class GeminiSemanticClient {
  private readonly adapter: GeminiAdapter;

  constructor(options?: GeminiSemanticClientOptions) {
    const model =
      options?.model ?? process.env.GEMINI_SEMANTIC_MODEL ?? DEFAULT_SEMANTIC_MODEL;
    this.adapter = new GeminiAdapter(options?.apiKey, model);
  }

  /**
   * Executa um prompt JSON-only e valida a resposta com o validator
   * fornecido. O validator é síncrono, puro e lança em caso de
   * inconsistência — isso garante que o tipo de retorno é confiável.
   */
  async generateJson<T>(
    req: JsonPromptRequest,
    validate: (raw: unknown) => T,
  ): Promise<T> {
    const hardenedSystem = req.systemPrompt + '\n' + JSON_RULES;

    let raw: string;
    try {
      raw = await this.adapter.generateText(req.userPrompt, {
        systemPrompt: hardenedSystem,
        temperature: req.temperature ?? 0.2,
        maxTokens: req.maxTokens ?? 1024,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new GeminiSemanticError(`[GeminiSemanticClient] Upstream call failed: ${msg}`);
    }

    const jsonString = extractFirstJsonObject(raw);
    if (jsonString === null) {
      throw new GeminiSemanticError(
        '[GeminiSemanticClient] No JSON object found in response',
        raw,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new GeminiSemanticError(
        `[GeminiSemanticClient] JSON parse failed: ${msg}`,
        raw,
      );
    }

    try {
      return validate(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[GeminiSemanticClient] Validation failed: ${msg}`);
      throw new GeminiSemanticError(
        `[GeminiSemanticClient] Response validation failed: ${msg}`,
        raw,
      );
    }
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/**
 * Extrai o primeiro objeto JSON de um texto potencialmente sujo. Remove
 * code fences markdown e localiza o primeiro `{...}` balanceado pelo
 * match mais externo. Retorna `null` se não encontrar estrutura válida.
 */
function extractFirstJsonObject(raw: string): string | null {
  // Remove code fences do tipo ```json ... ```
  const stripped = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const start = stripped.indexOf('{');
  if (start < 0) return null;

  // Busca o `}` correspondente varrendo com um contador de chaves;
  // respeita strings para não contar `{` dentro de string literals.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return stripped.slice(start, i + 1);
    }
  }
  return null;
}
