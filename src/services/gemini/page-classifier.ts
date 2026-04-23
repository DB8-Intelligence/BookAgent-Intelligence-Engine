/**
 * Gemini Page Classifier
 *
 * Classifica uma página do material imobiliário em uma das 6 classes
 * canônicas (`PageType`) usando APENAS o texto da página.
 *
 * IMPORTANTE:
 *  - Nunca recebe imagens.
 *  - Nunca decide layout, crop ou aspecto visual.
 *  - É uma *sugestão semântica* que complementa a heurística existente
 *    em `correlation/asset-classifier.ts`. O consumidor decide se usa.
 *
 * Prompt em português porque o material-fonte é em português (corretores
 * brasileiros). O modelo 1.5-pro é estável em pt-BR.
 */

import type { GeminiSemanticClient } from './gemini-client.js';
import type { PageClassificationResult, PageType } from './types.js';
import { VALID_PAGE_TYPES } from './types.js';

const MAX_PAGE_TEXT_CHARS = 3000;

const SYSTEM_PROMPT = `Você é um analista especializado em books de empreendimentos imobiliários.
Sua tarefa é classificar uma página de um book baseado APENAS no texto extraído.
Você nunca vê imagens.

Classes válidas (escolha uma):
- facade: fachada do edifício, volumetria, arquitetura externa, render externo
- lifestyle: cotidiano do morador, casais, família, sofisticação de vida
- location: localização, mapa, pontos de interesse, vizinhança, avenidas
- floorplan: planta baixa, pavimento tipo, apartamento, dimensões, m²
- amenities: áreas de lazer, fitness, piscina, bar, salão de festas, spa
- hero: capa, abertura, headline principal, logo do empreendimento, tagline

Regras:
- confidence é 0.0 a 1.0
- reasoning deve ser curto (1-2 frases em pt-BR)
- secondaryTypes pode ser um array vazio`;

function buildUserPrompt(pageText: string, metadata?: Record<string, unknown>): string {
  const truncated =
    pageText.length > MAX_PAGE_TEXT_CHARS
      ? pageText.slice(0, MAX_PAGE_TEXT_CHARS) + '...[truncated]'
      : pageText;
  const metaBlock = metadata ? `\n\nMetadados: ${JSON.stringify(metadata)}` : '';
  return `Classifique a página a seguir. Retorne JSON com este shape exato:

{
  "pageType": "facade|lifestyle|location|floorplan|amenities|hero",
  "confidence": 0.0,
  "reasoning": "explicação curta em português",
  "secondaryTypes": []
}

Texto da página:
---
${truncated}
---${metaBlock}`;
}

function validate(raw: unknown): PageClassificationResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('response is not an object');
  }
  const r = raw as Record<string, unknown>;

  const pageTypeRaw = String(r.pageType ?? '').toLowerCase();
  if (!VALID_PAGE_TYPES.includes(pageTypeRaw as PageType)) {
    throw new Error(`invalid pageType: ${r.pageType}`);
  }
  const pageType = pageTypeRaw as PageType;

  const confidence = typeof r.confidence === 'number'
    ? Math.min(1, Math.max(0, r.confidence))
    : 0;
  const reasoning = typeof r.reasoning === 'string' ? r.reasoning : '';

  const secondaryTypes: PageType[] = Array.isArray(r.secondaryTypes)
    ? r.secondaryTypes
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.toLowerCase())
        .filter((t): t is PageType =>
          VALID_PAGE_TYPES.includes(t as PageType) && t !== pageType,
        )
    : [];

  return { pageType, confidence, reasoning, secondaryTypes };
}

export class GeminiPageClassifier {
  constructor(private readonly client: GeminiSemanticClient) {}

  /**
   * Classifica o texto de uma página em uma das 6 classes canônicas.
   * `metadata` opcional é serializado e passado como contexto ao modelo
   * (por exemplo: número da página, título do book, tenant).
   */
  async classify(
    pageText: string,
    metadata?: Record<string, unknown>,
  ): Promise<PageClassificationResult> {
    return this.client.generateJson<PageClassificationResult>(
      {
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(pageText, metadata),
        temperature: 0.1,
        maxTokens: 512,
      },
      validate,
    );
  }
}
