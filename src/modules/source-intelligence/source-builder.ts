/**
 * Source Builder
 *
 * Converte CorrelationBlock[] em Source[] — a entidade central
 * do BookAgent para consumo pelos módulos de geração.
 *
 * Para cada CorrelationBlock:
 * 1. Mapeia inferredType → SourceType
 * 2. Extrai título a partir da headline ou do conteúdo
 * 3. Concatena texto dos TextBlocks
 * 4. Gera summary (v1: primeira frase; v2: IAIAdapter)
 * 5. Gera description a partir do conteúdo
 * 6. Transfere assetIds, roles, tags, confidence
 * 7. Injeta brandingContext do BrandingProfile global
 */

import { v4 as uuid } from 'uuid';
import type { Source, BrandingContext } from '../../domain/entities/source.js';
import type { BrandingProfile } from '../../domain/entities/branding.js';
import type { CorrelationBlock, TextBlock } from '../../domain/entities/correlation.js';
import { CorrelationConfidence, TextBlockType } from '../../domain/entities/correlation.js';
import { SourceType, NarrativeRole, CommercialRole } from '../../domain/value-objects/index.js';

/**
 * Converte um array de CorrelationBlocks em Sources estruturadas.
 */
export function buildSources(
  blocks: CorrelationBlock[],
  branding?: BrandingProfile,
): Source[] {
  const brandingCtx = branding
    ? { colors: branding.colors, style: String(branding.style) }
    : undefined;

  return blocks.map((block) => buildSourceFromBlock(block, brandingCtx));
}

/**
 * Converte um único CorrelationBlock em Source.
 */
function buildSourceFromBlock(
  block: CorrelationBlock,
  brandingCtx?: BrandingContext,
): Source {
  const type = block.inferredType ?? SourceType.EDITORIAL;
  const title = generateTitle(block, type);
  const text = assembleText(block.textBlocks);
  const summary = generateSummary(block, text);
  const description = generateDescription(block, type, text);
  const confidence = mapConfidence(block.confidence);

  return {
    id: uuid(),
    type,
    title,
    text,
    summary,
    description,
    assetIds: [...block.assetIds],
    tags: [...block.tags],
    confidenceScore: confidence,
    sourcePage: block.page,
    narrativeRole: block.inferredNarrativeRole,
    commercialRole: block.inferredCommercialRole,
    brandingContext: brandingCtx,
    priority: block.priority,
    createdAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Title generation
// ---------------------------------------------------------------------------

/** Rótulos descritivos por tipo de fonte */
const TYPE_LABELS: Record<string, string> = {
  [SourceType.HERO]: 'Abertura',
  [SourceType.LIFESTYLE]: 'Lazer & Lifestyle',
  [SourceType.DIFERENCIAL]: 'Diferenciais',
  [SourceType.INFRAESTRUTURA]: 'Infraestrutura',
  [SourceType.PLANTA]: 'Plantas & Tipologias',
  [SourceType.COMPARATIVO]: 'Comparativo & Localização',
  [SourceType.INVESTIMENTO]: 'Investimento & Condições',
  [SourceType.CTA]: 'Call to Action',
  [SourceType.INSTITUCIONAL]: 'Institucional',
  [SourceType.EDITORIAL]: 'Conteúdo Editorial',
};

function generateTitle(block: CorrelationBlock, type: SourceType): string {
  // Preferir headline do bloco
  if (block.headline && block.headline.length > 3) {
    return cleanTitle(block.headline);
  }

  // Tentar headline de text blocks
  for (const tb of block.textBlocks) {
    if (tb.headline && tb.headline.length > 3) {
      return cleanTitle(tb.headline);
    }
  }

  // Extrair primeira frase curta do texto
  const firstText = block.textBlocks[0]?.content ?? '';
  const firstLine = firstText.split('\n')[0]?.trim() ?? '';
  if (firstLine.length > 5 && firstLine.length < 80) {
    return cleanTitle(firstLine);
  }

  // Fallback: tipo + página
  const label = TYPE_LABELS[type] ?? 'Conteúdo';
  return `${label} — Página ${block.page}`;
}

function cleanTitle(raw: string): string {
  // Remover trailing punctuation e limitar tamanho
  let title = raw.replace(/[.,:;!?\-–—]+$/, '').trim();
  if (title.length > 100) {
    title = title.slice(0, 97) + '...';
  }
  return title;
}

// ---------------------------------------------------------------------------
// Text assembly
// ---------------------------------------------------------------------------

/**
 * Concatena texto de todos os TextBlocks em ordem lógica:
 * headlines primeiro, depois parágrafos, bullets, captions.
 */
function assembleText(textBlocks: TextBlock[]): string {
  if (textBlocks.length === 0) return '';

  // Ordenar: headline > paragraph > bullet > caption > cta
  const order: Record<string, number> = {
    [TextBlockType.HEADLINE]: 0,
    [TextBlockType.PARAGRAPH]: 1,
    [TextBlockType.BULLET_LIST]: 2,
    [TextBlockType.MIXED]: 3,
    [TextBlockType.CAPTION]: 4,
    [TextBlockType.CTA]: 5,
  };

  const sorted = [...textBlocks].sort(
    (a, b) => (order[a.blockType] ?? 3) - (order[b.blockType] ?? 3),
  );

  return sorted.map((tb) => tb.content).join('\n\n');
}

// ---------------------------------------------------------------------------
// Summary generation
// ---------------------------------------------------------------------------

/**
 * Gera resumo de 1-2 frases. v1: heurística. v2: IAIAdapter.
 */
function generateSummary(block: CorrelationBlock, fullText: string): string {
  // Usar summary do bloco se já existir
  if (block.summary && block.summary.length > 10) {
    return block.summary;
  }

  // Extrair primeira frase significativa
  const sentences = fullText
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  if (sentences.length === 0) return '';

  // Pegar até 2 frases
  const summary = sentences.slice(0, 2).join('. ');
  return summary.length > 250 ? summary.slice(0, 247) + '...' : summary;
}

// ---------------------------------------------------------------------------
// Description generation
// ---------------------------------------------------------------------------

/**
 * Gera descrição detalhada para uso em outputs.
 * v1: combinação de headline + resumo + keywords.
 * v2: geração via IAIAdapter.
 */
function generateDescription(
  block: CorrelationBlock,
  type: SourceType,
  fullText: string,
): string {
  const parts: string[] = [];

  // Tipo da fonte
  const label = TYPE_LABELS[type] ?? 'Conteúdo';
  parts.push(`[${label}]`);

  // Headline
  if (block.headline) {
    parts.push(block.headline);
  }

  // Texto principal (truncado)
  if (fullText.length > 0) {
    const truncated = fullText.length > 300 ? fullText.slice(0, 297) + '...' : fullText;
    parts.push(truncated);
  }

  // Assets
  if (block.assetIds.length > 0) {
    parts.push(`(${block.assetIds.length} asset(s) visual(is) vinculado(s))`);
  }

  return parts.join(' — ');
}

// ---------------------------------------------------------------------------
// Confidence mapping
// ---------------------------------------------------------------------------

/**
 * Converte CorrelationConfidence em score numérico (0-1).
 */
function mapConfidence(confidence: CorrelationConfidence): number {
  switch (confidence) {
    case CorrelationConfidence.HIGH:
      return 0.9;
    case CorrelationConfidence.MEDIUM:
      return 0.7;
    case CorrelationConfidence.LOW:
      return 0.5;
    case CorrelationConfidence.INFERRED:
      return 0.3;
    default:
      return 0.5;
  }
}
