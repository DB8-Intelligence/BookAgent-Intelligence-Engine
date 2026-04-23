/**
 * Gemini Semantic Layer — Domain Types
 *
 * Tipos de retorno das funções semânticas do serviço Gemini.
 * Todos são resultado de parsing JSON estruturado — zero texto livre.
 *
 * IMPORTANTE: nenhum tipo aqui descreve saída visual, crop ou layout.
 * Esta camada é estritamente semântica (texto → texto tipado).
 */

// ============================================================================
// Enums fechados — fonte única de verdade, espelhada nos prompts Gemini
// ============================================================================

/**
 * Tipos de página canônicos do pipeline visual do BookAgent. A classificação
 * Gemini é uma *sugestão* que complementa a heurística existente em
 * `correlation/asset-classifier.ts` — nunca substitui.
 */
export type PageType =
  | 'facade'
  | 'lifestyle'
  | 'location'
  | 'floorplan'
  | 'amenities'
  | 'hero';

export const VALID_PAGE_TYPES: readonly PageType[] = [
  'facade',
  'lifestyle',
  'location',
  'floorplan',
  'amenities',
  'hero',
] as const;

/**
 * Tons canônicos. Usado por `intent-extractor` e consumido por
 * `narrative`/`media` como hint. Não mapeia diretamente a um renderer.
 */
export type IntentTone =
  | 'luxury'
  | 'exclusivity'
  | 'technical'
  | 'institutional'
  | 'lifestyle'
  | 'investment';

export const VALID_INTENT_TONES: readonly IntentTone[] = [
  'luxury',
  'exclusivity',
  'technical',
  'institutional',
  'lifestyle',
  'investment',
] as const;

// ============================================================================
// Result shapes
// ============================================================================

/**
 * Resultado da classificação de página. Carrega a classe principal, um
 * nível de confiança 0..1 e uma lista opcional de classes secundárias.
 */
export interface PageClassificationResult {
  readonly pageType: PageType;
  readonly confidence: number;
  readonly reasoning: string;
  readonly secondaryTypes: readonly PageType[];
}

/**
 * Resultado da extração de intenção. Representa o que o texto *quer
 * comunicar*, independente de como será composto no output final.
 */
export interface IntentExtractionResult {
  readonly mainMessage: string;
  readonly tone: IntentTone;
  readonly keywords: readonly string[];
  readonly audience: string;
}

/**
 * Resultado da geração de roteiro/caption. Ambas strings são prontas
 * para consumo do `narrative`/`media` — sem markdown, sem código.
 */
export interface ScriptGenerationResult {
  readonly caption: string;
  readonly voiceOver: string;
  readonly hashtags: readonly string[];
  readonly cta: string | null;
}
