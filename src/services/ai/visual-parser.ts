/**
 * Visual Parser — Análise multimodal de imagens via Gemini (REST API)
 *
 * Especializado em imóveis: identifica categoria (fachada/lazer/planta),
 * avalia qualidade e sugere o melhor crop 9:16 para Reels.
 *
 * Uso:
 *   const analysis = await analyzeImage(buffer, 'image/jpeg', { targetAspect: '9:16' });
 *   // analysis.cropSuggestion => coordenadas normalizadas pra crop
 *   // analysis.relevanceForReel => 0..1, serve pra rankear as top N
 *
 * Diferença do pdf-analyzer.ts:
 *   - pdf-analyzer: consome PDF inteiro e retorna top 5 imagens + paleta + hooks
 *   - visual-parser: consome UMA imagem e retorna análise detalhada
 *
 * Integração no pipeline:
 *   - AssetExtractionModule: depois de extrair cada imagem, chama analyzeImage
 *     se VISUAL_PARSER_ENABLED=true. Popula asset.visualAnalysis com crop +
 *     relevância. SceneComposer então ordena os assets por relevance e aplica
 *     o crop sugerido no render.
 *
 * Model: GEMINI_MODEL env var (default gemini-2.0-flash, multimodal-capable)
 * Fallback: sem GEMINI_API_KEY → retorna defaults neutros (center crop, relevance 0.5)
 */

import { GeminiAdapter } from '../../adapters/ai/gemini/index.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImageCategory =
  | 'hero'        // fachada, ângulo principal
  | 'lifestyle'   // piscina, área de lazer, vista
  | 'interior'    // sala, cozinha, quarto
  | 'planta'      // planta baixa, tipologia
  | 'detalhe'     // acabamento, material
  | 'exterior'    // jardim, área externa
  | 'outro';

export interface CropSuggestion {
  aspectRatio: '9:16' | '1:1' | '16:9' | '4:5';
  /** Coordenadas normalizadas (0..1) — multiply por (width, height) da imagem */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Justificativa curta da escolha */
  reason: string;
}

export interface ImageAnalysis {
  /** Descrição curta do que a imagem mostra (≤15 palavras) */
  description: string;
  /** Categoria imobiliária */
  category: ImageCategory;
  /** Qualidade visual geral (0..1) — foco, iluminação, composição */
  qualityScore: number;
  /** Relevância pra Reel (0..1) — hero > lifestyle > interior > detalhe */
  relevanceForReel: number;
  /** Crop recomendado para o target aspect ratio */
  cropSuggestion: CropSuggestion;
  /** Se tem texto legível (logo, CTA, preço) — pode inflar relevância */
  hasText: boolean;
  /** Modelo usado */
  model: string;
}

export interface VisualParserOptions {
  /** Aspect ratio alvo para o crop suggestion (default 9:16) */
  targetAspect?: '9:16' | '1:1' | '16:9' | '4:5';
  /** Override do adapter (p/ testes) */
  adapter?: GeminiAdapter;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(target: string): string {
  return `Você é um diretor de arte especializado em marketing imobiliário para Instagram Reels.
Analise a imagem fornecida e retorne APENAS um JSON válido (sem markdown, sem texto fora):

{
  "description": "string (o que a imagem mostra, máx 15 palavras, pt-BR)",
  "category": "hero | lifestyle | interior | planta | detalhe | exterior | outro",
  "qualityScore": 0.0 a 1.0,
  "relevanceForReel": 0.0 a 1.0,
  "cropSuggestion": {
    "aspectRatio": "${target}",
    "x": 0.0 a 1.0 (canto superior esquerdo do crop, normalizado),
    "y": 0.0 a 1.0,
    "width": 0.0 a 1.0 (proporção da largura da imagem original),
    "height": 0.0 a 1.0,
    "reason": "string curto"
  },
  "hasText": true | false
}

Regras de crop para ${target}:
- Priorize o SUJEITO PRINCIPAL no terço central horizontal
- Evite cortar elementos importantes (fachada inteira, piscina, mobília)
- Se a imagem original já é vertical, crop pode ser quase identity (x=0 y=0 w=1 h=1)
- Para imagens horizontais, calcule o crop 9:16 que preserve o melhor sujeito

Regras de relevance (para Reels imobiliários):
- hero / fachada: 0.9-1.0
- lifestyle / piscina / vista: 0.8-0.9
- interior nobre (sala, varanda): 0.6-0.8
- planta baixa: 0.3-0.5
- detalhe / acabamento: 0.2-0.4
- logos, capas, textos: 0.1-0.2`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analisa uma imagem e retorna categoria, crop 9:16 e relevância.
 *
 * Não lança — em caso de erro retorna defaults neutros para não quebrar
 * o pipeline. Logs de erro são warnings.
 */
export async function analyzeImage(
  imageBuffer: Buffer,
  mimeType: string,
  opts: VisualParserOptions = {},
): Promise<ImageAnalysis> {
  const target = opts.targetAspect ?? '9:16';
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';

  try {
    const adapter = opts.adapter ?? new GeminiAdapter();
    const prompt = buildSystemPrompt(target);

    const raw = await adapter.analyzeMultimodal(imageBuffer, prompt, mimeType);
    const cleaned = stripCodeFences(raw).trim();

    const parsed = JSON.parse(cleaned) as Partial<ImageAnalysis>;

    // Validate + normalize
    return {
      description: parsed.description ?? '',
      category: normalizeCategory(parsed.category),
      qualityScore: clamp01(parsed.qualityScore ?? 0.5),
      relevanceForReel: clamp01(parsed.relevanceForReel ?? 0.5),
      cropSuggestion: normalizeCrop(parsed.cropSuggestion, target),
      hasText: parsed.hasText ?? false,
      model,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[VisualParser] Failed — returning neutral defaults: ${msg}`);
    return defaultAnalysis(target, model);
  }
}

/**
 * Analisa múltiplas imagens em paralelo. Bom pra processar em batch
 * após AssetExtraction.
 */
export async function analyzeImageBatch(
  images: Array<{ buffer: Buffer; mimeType: string; id: string }>,
  opts: VisualParserOptions = {},
): Promise<Array<ImageAnalysis & { id: string }>> {
  logger.info(`[VisualParser] Batch analyzing ${images.length} images`);
  const results = await Promise.all(
    images.map(async (img) => {
      const analysis = await analyzeImage(img.buffer, img.mimeType, opts);
      return { ...analysis, id: img.id };
    }),
  );
  return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  if (typeof v !== 'number' || Number.isNaN(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

function normalizeCategory(c: unknown): ImageCategory {
  const valid: ImageCategory[] = ['hero', 'lifestyle', 'interior', 'planta', 'detalhe', 'exterior', 'outro'];
  if (typeof c === 'string' && valid.includes(c as ImageCategory)) return c as ImageCategory;
  return 'outro';
}

function normalizeCrop(c: Partial<CropSuggestion> | undefined, target: string): CropSuggestion {
  if (!c) return defaultCrop(target);
  return {
    aspectRatio: (c.aspectRatio as CropSuggestion['aspectRatio']) ?? (target as CropSuggestion['aspectRatio']),
    x: clamp01(c.x ?? 0),
    y: clamp01(c.y ?? 0),
    width: clamp01(c.width ?? 1),
    height: clamp01(c.height ?? 1),
    reason: c.reason ?? 'default center crop',
  };
}

function defaultCrop(target: string): CropSuggestion {
  return {
    aspectRatio: target as CropSuggestion['aspectRatio'],
    x: 0, y: 0, width: 1, height: 1,
    reason: 'default — no analysis available',
  };
}

function defaultAnalysis(target: string, model: string): ImageAnalysis {
  return {
    description: '',
    category: 'outro',
    qualityScore: 0.5,
    relevanceForReel: 0.5,
    cropSuggestion: defaultCrop(target),
    hasText: false,
    model: `${model} (fallback)`,
  };
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}
