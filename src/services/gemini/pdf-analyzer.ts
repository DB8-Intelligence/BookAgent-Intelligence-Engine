/**
 * Gemini PDF Analyzer — Análise multimodal direta de PDFs imobiliários
 *
 * Em vez de rodar os 17 stages do pipeline tradicional (ingestion → extraction →
 * correlation → source intelligence → narrative → ...), chamamos o Gemini/Vertex
 * uma vez com o PDF inteiro (multimodal) e recebemos um JSON estruturado
 * pronto para alimentar o video renderer e o LP renderer.
 *
 * Quando usar:
 *   - Shortcut rápido para PDFs simples (≤20 páginas, ≤20MB)
 *   - Prototyping / debugging de prompts
 *   - Fallback quando o pipeline tradicional falha
 *
 * Quando NÃO usar:
 *   - PDFs com centenas de páginas (custo alto de tokens)
 *   - Quando precisa de correlação texto-imagem pixel-accurate (pipeline atual
 *     faz isso com poppler + pdfjs enhanced extraction, mais preciso)
 *
 * O prompt pede um JSON com:
 *   - top_images: 5 imagens mais impactantes (descrição + sugestão de crop)
 *   - color_scheme: paleta dominante (primary, secondary, accent em hex)
 *   - hooks: 3 frases de abertura (ganchos) para Reels
 *
 * A saída é compatível com o RenderSpec do video-renderer quando enriquecida
 * com assets extraídos separadamente.
 */

import { readFile } from 'node:fs/promises';
import { GeminiAdapter } from '../../adapters/ai/gemini/index.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface TopImage {
  /** Descrição do que a imagem mostra (ex: "fachada ao entardecer com piscina") */
  description: string;
  /** Página do PDF onde está (1-indexed) */
  page: number;
  /** Sugestão de crop/framing para Reel 9:16 — "center", "top-left", etc. */
  crop: string;
  /** Justificativa do impacto (por que essa imagem é top 5) */
  reason: string;
}

export interface ColorScheme {
  primary: string;   // hex #RRGGBB
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface ReelHook {
  /** Frase de abertura (≤10 palavras) */
  text: string;
  /** Tom: aspiracional | informativo | emocional | urgente */
  tone: string;
  /** Imagem sugerida para acompanhar (índice em top_images, 0-based) */
  suggestedImageIndex: number;
}

export interface PDFAnalysisResult {
  top_images: TopImage[];
  color_scheme: ColorScheme;
  hooks: ReelHook[];
  /** Metadata do PDF analisado */
  meta: {
    pages_analyzed: number;
    model: string;
    analyzed_at: string;
    raw_response_length: number;
  };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Você é um diretor de arte especializado em marketing imobiliário para Instagram Reels.
Sua tarefa: analisar um PDF de empreendimento imobiliário (book) e extrair elementos
acionáveis para produção de Reels de alto impacto.

Responda SEMPRE em JSON válido, sem markdown, sem comentários, sem texto fora do JSON.
Schema obrigatório:

{
  "top_images": [
    {
      "description": "string (o que a imagem mostra)",
      "page": number (1-indexed),
      "crop": "center | top | bottom | top-left | top-right | bottom-left | bottom-right",
      "reason": "string (por que essa imagem é top 5)"
    }
  ],
  "color_scheme": {
    "primary": "#RRGGBB",
    "secondary": "#RRGGBB",
    "accent": "#RRGGBB",
    "background": "#RRGGBB",
    "text": "#RRGGBB"
  },
  "hooks": [
    {
      "text": "string (máx 10 palavras, português BR)",
      "tone": "aspiracional | informativo | emocional | urgente",
      "suggestedImageIndex": number (0-4)
    }
  ]
}

Regras:
- top_images: EXATAMENTE 5 imagens, priorizando fachada/hero, lazer/piscina,
  vista, área nobre, planta decorada
- color_scheme: cores dominantes do PDF (identidade do empreendimento)
- hooks: EXATAMENTE 3 ganchos, cada um com tom diferente
- Ignore logotipos, ícones, watermarks — foque em fotografias e renders`;

const USER_PROMPT = `Analise o PDF deste empreendimento imobiliário e extraia os elementos
estruturados para gerar Reels no Instagram. Retorne apenas o JSON conforme o schema.`;

// ---------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------

export interface PDFAnalyzerOptions {
  /** Provider always 'gemini' since Sprint 3.10 (Vertex SDK removido) */
  provider?: 'gemini';
}

/**
 * Analisa um PDF inteiro via Gemini multimodal e retorna estrutura
 * para alimentar video renderer + LP renderer.
 *
 * @throws quando o provider não consegue parsear o JSON de volta
 */
export async function analyzePDF(
  pdfPath: string,
  _options?: PDFAnalyzerOptions,
): Promise<PDFAnalysisResult> {
  const startTime = Date.now();
  const pdfBuffer = await readFile(pdfPath);

  logger.info(`[PDFAnalyzer] Analyzing ${pdfPath} via gemini (${(pdfBuffer.length / 1024 / 1024).toFixed(1)} MB)`);

  const gemini = new GeminiAdapter();
  const rawResponse = await gemini.analyzeMultimodal(
    pdfBuffer,
    `${SYSTEM_PROMPT}\n\n${USER_PROMPT}`,
    'application/pdf',
  );

  // Parse — Gemini sometimes wraps JSON in ```json ... ``` even when asked not to
  const cleaned = stripCodeFences(rawResponse).trim();

  let parsed: PDFAnalysisResult;
  try {
    parsed = JSON.parse(cleaned) as PDFAnalysisResult;
  } catch (err) {
    logger.error(`[PDFAnalyzer] Failed to parse JSON. Raw:\n${cleaned.slice(0, 500)}`);
    throw new Error(
      `[PDFAnalyzer] Gemini returned non-JSON. First 200 chars: ${cleaned.slice(0, 200)}`,
    );
  }

  // Enrich with meta
  parsed.meta = {
    pages_analyzed: 0, // Gemini não reporta — deixamos 0 ou estimamos via buffer
    model: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
    analyzed_at: new Date().toISOString(),
    raw_response_length: rawResponse.length,
  };

  logger.info(
    `[PDFAnalyzer] Completed in ${Date.now() - startTime}ms — ` +
    `${parsed.top_images.length} images, ${parsed.hooks.length} hooks`,
  );

  return parsed;
}

/**
 * Versão in-memory: aceita Buffer em vez de path. Útil quando o PDF já
 * está em memória (baixado do GCS sem disk round-trip).
 *
 * Sprint 3.10: agora usa Gemini REST API direto (era Vertex). Aceita buffers
 * via inline base64 — sem write-to-disk intermediário.
 */
export async function analyzePDFBuffer(
  pdfBuffer: Buffer,
  _options?: PDFAnalyzerOptions,
): Promise<PDFAnalysisResult> {
  const startTime = Date.now();
  logger.info(`[PDFAnalyzer] Analyzing buffer (${(pdfBuffer.length / 1024 / 1024).toFixed(1)} MB) via gemini`);

  const gemini = new GeminiAdapter();
  const rawResponse = await gemini.analyzeMultimodal(
    pdfBuffer,
    `${SYSTEM_PROMPT}\n\n${USER_PROMPT}`,
    'application/pdf',
  );

  const cleaned = stripCodeFences(rawResponse).trim();

  let parsed: PDFAnalysisResult;
  try {
    parsed = JSON.parse(cleaned) as PDFAnalysisResult;
  } catch {
    throw new Error(
      `[PDFAnalyzer] Gemini returned non-JSON. First 200 chars: ${cleaned.slice(0, 200)}`,
    );
  }

  parsed.meta = {
    pages_analyzed: 0,
    model: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
    analyzed_at: new Date().toISOString(),
    raw_response_length: rawResponse.length,
  };

  logger.info(`[PDFAnalyzer] Completed in ${Date.now() - startTime}ms`);
  return parsed;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripCodeFences(text: string): string {
  // Remove ```json ... ``` or ``` ... ``` wrappers that Gemini sometimes adds
  return text
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}
