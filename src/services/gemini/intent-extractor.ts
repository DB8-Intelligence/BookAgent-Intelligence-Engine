/**
 * Gemini Intent Extractor
 *
 * Extrai a intenção comunicativa de um texto: mensagem principal, tom,
 * palavras-chave e público-alvo. Usado pelo `source-intelligence` e
 * `narrative` como hint para ranking e roteirização.
 *
 * IMPORTANTE: só recebe texto. Nada de imagem. Nada de decisão visual.
 */

import type { GeminiSemanticClient } from './gemini-client.js';
import type { IntentExtractionResult, IntentTone } from './types.js';
import { VALID_INTENT_TONES } from './types.js';

const MAX_TEXT_CHARS = 4000;

const SYSTEM_PROMPT = `Você é um especialista em comunicação imobiliária de luxo.
Analise o texto de uma página de book de empreendimento e extraia a intenção comunicativa.

Tons válidos (escolha um):
- luxury: sofisticação, exclusividade, materiais nobres
- exclusivity: escassez, poucos unidades, número limitado
- technical: especificações, m², metragens, itens construtivos
- institutional: sobre a construtora, trajetória, portfólio
- lifestyle: experiência de viver, bem-estar, rotina
- investment: valorização, localização estratégica, rentabilidade

Regras:
- mainMessage: uma frase curta em pt-BR que resume o que o texto quer comunicar
- audience: descrição curta do leitor-alvo (ex: "casal classe A 40+")
- keywords: 3-8 termos extraídos do texto, sem stopwords`;

function buildUserPrompt(pageText: string): string {
  const truncated =
    pageText.length > MAX_TEXT_CHARS
      ? pageText.slice(0, MAX_TEXT_CHARS) + '...[truncated]'
      : pageText;
  return `Extraia a intenção do texto abaixo. Retorne JSON com este shape exato:

{
  "mainMessage": "frase curta em pt-BR",
  "tone": "luxury|exclusivity|technical|institutional|lifestyle|investment",
  "keywords": ["termo1", "termo2"],
  "audience": "descrição curta do leitor-alvo"
}

Texto:
---
${truncated}
---`;
}

function validate(raw: unknown): IntentExtractionResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('response is not an object');
  }
  const r = raw as Record<string, unknown>;

  const mainMessage = typeof r.mainMessage === 'string' ? r.mainMessage.trim() : '';
  if (mainMessage.length === 0) {
    throw new Error('mainMessage is empty');
  }

  const toneRaw = String(r.tone ?? '').toLowerCase();
  if (!VALID_INTENT_TONES.includes(toneRaw as IntentTone)) {
    throw new Error(`invalid tone: ${r.tone}`);
  }
  const tone = toneRaw as IntentTone;

  const keywords: string[] = Array.isArray(r.keywords)
    ? r.keywords
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim())
        .filter((k) => k.length > 0)
        .slice(0, 10)
    : [];

  const audience = typeof r.audience === 'string' ? r.audience.trim() : '';

  return { mainMessage, tone, keywords, audience };
}

export class GeminiIntentExtractor {
  constructor(private readonly client: GeminiSemanticClient) {}

  async extract(pageText: string): Promise<IntentExtractionResult> {
    return this.client.generateJson<IntentExtractionResult>(
      {
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(pageText),
        temperature: 0.3,
        maxTokens: 512,
      },
      validate,
    );
  }
}
