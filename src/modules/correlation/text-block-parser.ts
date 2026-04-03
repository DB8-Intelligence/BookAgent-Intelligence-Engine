/**
 * Text Block Parser
 *
 * Divide o texto de cada página em blocos semânticos (headline,
 * parágrafo, bullet list, CTA, caption).
 *
 * Estratégia v1 (heurística):
 * 1. Separa o texto por linhas em branco (double newline)
 * 2. Classifica cada bloco pelo padrão textual:
 *    - Linhas curtas e em MAIÚSCULAS → headline
 *    - Linhas começando com bullet (•, -, ★, ✓) → bullet-list
 *    - Frases com "ligue", "agende", "saiba mais", WhatsApp → CTA
 *    - Blocos curtos (< 30 chars) após imagem → caption
 *    - Demais → paragraph
 * 3. Extrai palavras-chave relevantes de cada bloco
 *
 * Evolução futura: usar IAIAdapter para segmentação semântica.
 */

import { TextBlockType } from '../../domain/entities/correlation.js';
import type { TextBlock } from '../../domain/entities/correlation.js';

/** Palavras-chave de CTA em português */
const CTA_PATTERNS = [
  'ligue', 'agende', 'saiba mais', 'visite', 'whatsapp', 'contato',
  'cadastre', 'inscreva', 'reserve', 'garanta', 'aproveite', 'consulte',
  'fale conosco', 'entre em contato', 'acesse', 'clique',
];

/** Marcadores de bullet list */
const BULLET_MARKERS = /^[\s]*[•\-–—★✓✔▸▹◆◇●○►→⇒✦\*]\s/;

/** Stopwords para extração de keywords (PT-BR) */
const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas',
  'um', 'uma', 'uns', 'umas', 'o', 'a', 'os', 'as', 'que', 'com', 'por',
  'para', 'se', 'ao', 'sua', 'seu', 'mais', 'são', 'como', 'mas', 'este',
  'esta', 'esse', 'essa', 'pelo', 'pela', 'entre', 'sobre', 'todo', 'toda',
  'cada', 'muito', 'também', 'onde', 'quando', 'até', 'você', 'seu', 'seus',
]);

/**
 * Analisa o texto de todas as páginas e retorna blocos semânticos.
 */
export function parseTextBlocks(
  pageTexts: Array<{ pageNumber: number; text: string }>,
): TextBlock[] {
  const blocks: TextBlock[] = [];

  for (const page of pageTexts) {
    if (!page.text || page.text.trim().length === 0) continue;

    const pageBlocks = splitIntoBlocks(page.text, page.pageNumber);
    blocks.push(...pageBlocks);
  }

  return blocks;
}

/**
 * Divide o texto de uma página em blocos semânticos.
 */
function splitIntoBlocks(text: string, page: number): TextBlock[] {
  // Separar por linhas em branco (2+ newlines)
  const rawBlocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  if (rawBlocks.length === 0) {
    // Se não há separação por parágrafo, tratar a página inteira como bloco
    if (text.trim().length > 0) {
      return [createBlock(text.trim(), page)];
    }
    return [];
  }

  return rawBlocks.map((raw) => createBlock(raw, page));
}

function createBlock(content: string, page: number): TextBlock {
  const blockType = classifyBlockType(content);
  const headline = extractHeadline(content, blockType);
  const keywords = extractKeywords(content);

  return { content, headline, page, blockType, keywords };
}

/**
 * Classifica o tipo do bloco textual.
 */
function classifyBlockType(content: string): TextBlockType {
  const lines = content.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return TextBlockType.PARAGRAPH;

  const lowerContent = content.toLowerCase();

  // CTA: contém padrões de call-to-action
  if (CTA_PATTERNS.some((p) => lowerContent.includes(p))) {
    return TextBlockType.CTA;
  }

  // Bullet list: maioria das linhas começa com marcador
  const bulletLines = lines.filter((l) => BULLET_MARKERS.test(l));
  if (bulletLines.length > 0 && bulletLines.length >= lines.length * 0.5) {
    return TextBlockType.BULLET_LIST;
  }

  // Headline: bloco curto, possivelmente em maiúsculas
  if (lines.length <= 2 && content.length < 100) {
    const uppercaseRatio = (content.match(/[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/g) || []).length / content.length;
    if (uppercaseRatio > 0.5 || content.length < 50) {
      return TextBlockType.HEADLINE;
    }
  }

  // Caption: bloco muito curto
  if (content.length < 40 && lines.length === 1) {
    return TextBlockType.CAPTION;
  }

  return TextBlockType.PARAGRAPH;
}

/**
 * Extrai a headline do bloco (se houver).
 */
function extractHeadline(content: string, blockType: TextBlockType): string | undefined {
  if (blockType === TextBlockType.HEADLINE) {
    return content.split('\n')[0].trim();
  }

  // Para parágrafos/bullets, pegar a primeira linha se ela for curta e destacada
  const firstLine = content.split('\n')[0].trim();
  if (firstLine.length < 80 && firstLine.length > 3) {
    const rest = content.slice(firstLine.length).trim();
    if (rest.length > firstLine.length * 2) {
      return firstLine;
    }
  }

  return undefined;
}

/**
 * Extrai palavras-chave relevantes do texto.
 */
export function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-záàâãéêíóôõúçñ0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

  // Contar frequência
  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  // Top keywords por frequência (max 10)
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}
