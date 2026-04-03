/**
 * Source Merger
 *
 * Detecta e mescla Sources redundantes ou muito similares.
 *
 * Em books imobiliários é comum ter:
 * - Múltiplas páginas sobre o mesmo diferencial
 * - Várias imagens de lazer com textos repetitivos
 * - Blocos de planta em páginas consecutivas
 *
 * O merger agrupa fontes do mesmo tipo que estão em páginas próximas
 * e com alta sobreposição de keywords, mesclando-as em uma fonte
 * mais rica e completa.
 *
 * Estratégia v1: merge por tipo + proximidade de página + keyword overlap.
 * Evolução v2: merge por similaridade semântica via embeddings.
 */

import type { Source } from '../../domain/entities/source.js';

/** Distância máxima de páginas para considerar merge */
const MAX_PAGE_DISTANCE = 2;

/** Overlap mínimo de keywords para merge (0-1) */
const MIN_KEYWORD_OVERLAP = 0.3;

/**
 * Mescla sources redundantes.
 * Retorna array com fontes únicas e enriquecidas.
 */
export function mergeSimilarSources(sources: Source[]): Source[] {
  if (sources.length <= 1) return sources;

  const merged: Source[] = [];
  const consumed = new Set<string>();

  // Ordenar por tipo e página para agrupar candidatos
  const sorted = [...sources].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return (a.sourcePage ?? 0) - (b.sourcePage ?? 0);
  });

  for (const source of sorted) {
    if (consumed.has(source.id)) continue;

    // Procurar candidatos de merge entre os não consumidos
    const candidates = sorted.filter(
      (other) =>
        !consumed.has(other.id) &&
        other.id !== source.id &&
        canMerge(source, other),
    );

    if (candidates.length === 0) {
      merged.push(source);
      consumed.add(source.id);
      continue;
    }

    // Merge: combinar source + candidatos
    let result = source;
    consumed.add(source.id);

    for (const candidate of candidates) {
      result = mergeTwo(result, candidate);
      consumed.add(candidate.id);
    }

    merged.push(result);
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Merge logic
// ---------------------------------------------------------------------------

function canMerge(a: Source, b: Source): boolean {
  // Mesmo tipo
  if (a.type !== b.type) return false;

  // Páginas próximas
  const pageA = a.sourcePage ?? 0;
  const pageB = b.sourcePage ?? 0;
  if (Math.abs(pageA - pageB) > MAX_PAGE_DISTANCE) return false;

  // Overlap de keywords
  if (a.tags.length > 0 && b.tags.length > 0) {
    const overlap = keywordOverlap(a.tags, b.tags);
    if (overlap < MIN_KEYWORD_OVERLAP) return false;
  }

  return true;
}

function keywordOverlap(tagsA: string[], tagsB: string[]): number {
  const setA = new Set(tagsA);
  const setB = new Set(tagsB);
  let intersection = 0;
  for (const tag of setA) {
    if (setB.has(tag)) intersection++;
  }
  const union = new Set([...tagsA, ...tagsB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Mescla duas sources em uma, combinando textos, assets e metadados.
 * A source com maior confiança é a "primária" (mantém título e roles).
 */
function mergeTwo(primary: Source, secondary: Source): Source {
  // Escolher a de maior confiança como base
  const [base, extra] =
    primary.confidenceScore >= secondary.confidenceScore
      ? [primary, secondary]
      : [secondary, primary];

  // Combinar assets (deduplicate)
  const assetIds = [...new Set([...base.assetIds, ...extra.assetIds])];

  // Combinar texto (evitar duplicação)
  const text = combineTexts(base.text, extra.text);

  // Combinar tags (deduplicate)
  const tags = [...new Set([...base.tags, ...extra.tags])];

  // Summary: usar o mais longo
  const summary =
    (base.summary?.length ?? 0) >= (extra.summary?.length ?? 0)
      ? base.summary
      : extra.summary;

  // Confiança: média ponderada favorecendo a melhor
  const confidence =
    base.confidenceScore * 0.7 + extra.confidenceScore * 0.3;

  return {
    ...base,
    text,
    summary,
    assetIds,
    tags,
    confidenceScore: Math.round(confidence * 100) / 100,
    description: base.description, // Manter da base
  };
}

/**
 * Combina textos de duas sources evitando duplicação significativa.
 */
function combineTexts(textA: string, textB: string): string {
  if (!textB || textB.length === 0) return textA;
  if (!textA || textA.length === 0) return textB;

  // Se o texto secundário é muito similar ao primário (>60% overlap), ignorar
  const wordsA = new Set(textA.toLowerCase().split(/\s+/));
  const wordsB = textB.toLowerCase().split(/\s+/);
  const overlapCount = wordsB.filter((w) => wordsA.has(w)).length;
  const overlapRatio = wordsB.length > 0 ? overlapCount / wordsB.length : 0;

  if (overlapRatio > 0.6) return textA;

  return textA + '\n\n' + textB;
}
