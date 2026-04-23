/**
 * Gemini Script Generator
 *
 * Gera caption curto + voice-over para uma cena do pipeline visual,
 * a partir do tipo de página, intenção extraída e texto original.
 *
 * NÃO decide layout, nem corte, nem asset a usar. Apenas texto.
 *
 * Consumidores naturais:
 *  - `narrative` module — para enriquecer `NarrativeBeat.voiceover`
 *  - `media` module — para caption de posts e reels
 */

import type { GeminiSemanticClient } from './gemini-client.js';
import type {
  ScriptGenerationResult,
  PageType,
  IntentTone,
} from './types.js';
import { VALID_PAGE_TYPES, VALID_INTENT_TONES } from './types.js';

const MAX_SOURCE_TEXT_CHARS = 3000;
const MAX_CAPTION_CHARS = 220;
const MAX_VOICEOVER_CHARS = 500;

export interface ScriptGenerationInput {
  readonly pageType: PageType;
  readonly tone: IntentTone;
  readonly mainMessage: string;
  readonly originalText: string;
  readonly brandName?: string;
}

const SYSTEM_PROMPT = `Você é um copywriter de alta performance para materiais imobiliários de luxo brasileiros.
Gere captions curtos e voice-overs para reels/posts.

Regras obrigatórias:
- Tudo em português brasileiro
- Nenhum termo inventado que não esteja ancorado no texto-fonte
- Nenhuma promessa falsa (valorização, garantia, retorno)
- Caption ≤ 220 caracteres, direto
- Voice-over ≤ 500 caracteres, fluido para narração
- Hashtags: 3-8, sem números isolados, sem stopwords, com prefixo #
- CTA opcional: se o texto-fonte sugerir agendamento/visita/contato`;

function buildUserPrompt(input: ScriptGenerationInput): string {
  const truncated =
    input.originalText.length > MAX_SOURCE_TEXT_CHARS
      ? input.originalText.slice(0, MAX_SOURCE_TEXT_CHARS) + '...[truncated]'
      : input.originalText;
  const brandBlock = input.brandName
    ? `\nMarca/empreendimento: ${input.brandName}`
    : '';
  return `Gere um roteiro para a página. Retorne JSON com este shape exato:

{
  "caption": "≤220 chars",
  "voiceOver": "≤500 chars",
  "hashtags": ["#tag1", "#tag2"],
  "cta": "texto curto ou null"
}

Tipo da página: ${input.pageType}
Tom: ${input.tone}
Mensagem principal: ${input.mainMessage}${brandBlock}

Texto-fonte:
---
${truncated}
---`;
}

function validate(raw: unknown): ScriptGenerationResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('response is not an object');
  }
  const r = raw as Record<string, unknown>;

  const captionRaw = typeof r.caption === 'string' ? r.caption.trim() : '';
  if (captionRaw.length === 0) {
    throw new Error('caption is empty');
  }
  const caption = captionRaw.slice(0, MAX_CAPTION_CHARS);

  const voiceOverRaw = typeof r.voiceOver === 'string' ? r.voiceOver.trim() : '';
  if (voiceOverRaw.length === 0) {
    throw new Error('voiceOver is empty');
  }
  const voiceOver = voiceOverRaw.slice(0, MAX_VOICEOVER_CHARS);

  const hashtags: string[] = Array.isArray(r.hashtags)
    ? r.hashtags
        .filter((h): h is string => typeof h === 'string')
        .map((h) => {
          const trimmed = h.trim();
          return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
        })
        .filter((h) => h.length > 1)
        .slice(0, 10)
    : [];

  const cta =
    typeof r.cta === 'string' && r.cta.trim().length > 0
      ? r.cta.trim()
      : null;

  return { caption, voiceOver, hashtags, cta };
}

export class GeminiScriptGenerator {
  constructor(private readonly client: GeminiSemanticClient) {}

  async generate(input: ScriptGenerationInput): Promise<ScriptGenerationResult> {
    // Validação defensiva — previne inputs inválidos mesmo sem TS strict
    if (!VALID_PAGE_TYPES.includes(input.pageType)) {
      throw new Error(`[GeminiScriptGenerator] invalid pageType: ${input.pageType}`);
    }
    if (!VALID_INTENT_TONES.includes(input.tone)) {
      throw new Error(`[GeminiScriptGenerator] invalid tone: ${input.tone}`);
    }
    return this.client.generateJson<ScriptGenerationResult>(
      {
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(input),
        temperature: 0.6,
        maxTokens: 768,
      },
      validate,
    );
  }
}
