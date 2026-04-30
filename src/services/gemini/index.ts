/**
 * Gemini Semantic Layer — barrel + factory
 *
 * Camada plugável de inteligência semântica sobre o pipeline existente.
 * Usa exclusivamente Gemini 1.5 Pro (ou variante configurada) para:
 *  - classificar páginas (page-classifier)
 *  - extrair intenção comunicativa (intent-extractor)
 *  - gerar caption + voice-over (script-generator)
 *
 * REGRA CRÍTICA:
 *  - NADA aqui recebe imagens.
 *  - NADA aqui decide layout, crop, aspect ratio ou asset visual.
 *  - NADA aqui substitui a heurística existente em correlation/narrative;
 *    apenas complementa com hints semânticos.
 *
 * Integração opt-in:
 *  - O pipeline de produção (asset-extraction, scene-composer, render)
 *    não é tocado.
 *  - `source-intelligence` pode chamar `GeminiPageClassifier` para subir
 *    a confidence de blocos classificados.
 *  - `narrative` pode chamar `GeminiIntentExtractor` + `GeminiScriptGenerator`
 *    para popular `voiceover` e `caption` quando os adapters LLM estiverem
 *    disponíveis.
 *  - `media` pode usar o `GeminiScriptGenerator` para caption de posts.
 *
 * Degradação graciosa:
 *  - Se `GEMINI_API_KEY` não estiver configurado, `createGeminiSemanticStack`
 *    retorna `null`. Consumidores devem tratar o caso.
 */

export { GeminiSemanticClient, GeminiSemanticError } from './gemini-client.js';
export type {
  GeminiSemanticClientOptions,
  JsonPromptRequest,
} from './gemini-client.js';

export { GeminiPageClassifier } from './page-classifier.js';
export { GeminiIntentExtractor } from './intent-extractor.js';
export { GeminiScriptGenerator } from './script-generator.js';
export type { ScriptGenerationInput } from './script-generator.js';

export type {
  PageType,
  IntentTone,
  PageClassificationResult,
  IntentExtractionResult,
  ScriptGenerationResult,
} from './types.js';
export { VALID_PAGE_TYPES, VALID_INTENT_TONES } from './types.js';

import { GeminiSemanticClient } from './gemini-client.js';
import { GeminiPageClassifier } from './page-classifier.js';
import { GeminiIntentExtractor } from './intent-extractor.js';
import { GeminiScriptGenerator } from './script-generator.js';

export interface GeminiSemanticStack {
  readonly client: GeminiSemanticClient;
  readonly pageClassifier: GeminiPageClassifier;
  readonly intentExtractor: GeminiIntentExtractor;
  readonly scriptGenerator: GeminiScriptGenerator;
}

/**
 * Cria a stack semântica completa. Retorna `null` se `GEMINI_API_KEY`
 * não estiver configurado — consumidores devem cair em fallback heurístico.
 */
export function createGeminiSemanticStack(
  apiKey?: string,
  model?: string,
): GeminiSemanticStack | null {
  const resolvedKey = apiKey ?? process.env.GEMINI_API_KEY;
  if (!resolvedKey) return null;

  const client = new GeminiSemanticClient({ apiKey: resolvedKey, model });
  return {
    client,
    pageClassifier: new GeminiPageClassifier(client),
    intentExtractor: new GeminiIntentExtractor(client),
    scriptGenerator: new GeminiScriptGenerator(client),
  };
}
