/**
 * Page Correlator
 *
 * Correlaciona TextBlocks com Assets usando proximidade por página.
 *
 * Estratégia v1:
 * 1. Agrupar assets por página
 * 2. Agrupar text blocks por página
 * 3. Para cada página, criar um CorrelationBlock combinando os dois
 * 4. Atribuir confiança com base na riqueza da correlação:
 *    - HIGH: mesma página + texto e imagem presentes
 *    - MEDIUM: mesma página mas apenas texto ou apenas imagem
 *    - LOW: páginas adjacentes (±1)
 *
 * Evolução futura:
 * - Usar posição espacial (BoundingBox) quando disponível
 * - Matching semântico via IAIAdapter
 */

import { v4 as uuid } from 'uuid';
import type { Asset } from '../../domain/entities/asset.js';
import type { TextBlock, CorrelationBlock } from '../../domain/entities/correlation.js';
import {
  CorrelationConfidence,
  CorrelationMethod,
} from '../../domain/entities/correlation.js';

/**
 * Correlaciona text blocks e assets por proximidade de página.
 *
 * Retorna CorrelationBlocks com confiança e método atribuídos.
 */
export function correlateByPage(
  textBlocks: TextBlock[],
  assets: Asset[],
): CorrelationBlock[] {
  // Agrupar por página
  const textsByPage = groupByPage(textBlocks, (t) => t.page);
  const assetsByPage = groupByPage(assets, (a) => a.page);

  // Coletar todas as páginas com conteúdo
  const allPages = new Set([...textsByPage.keys(), ...assetsByPage.keys()]);
  const sortedPages = [...allPages].sort((a, b) => a - b);

  const blocks: CorrelationBlock[] = [];

  for (const page of sortedPages) {
    const pageTexts = textsByPage.get(page) ?? [];
    const pageAssets = assetsByPage.get(page) ?? [];

    // Caso principal: página tem texto E imagens → HIGH confidence
    if (pageTexts.length > 0 && pageAssets.length > 0) {
      blocks.push(
        buildCorrelationBlock(page, pageTexts, pageAssets, CorrelationConfidence.HIGH, [
          CorrelationMethod.PAGE_PROXIMITY,
        ]),
      );
      continue;
    }

    // Página só com imagens → tentar correlacionar com texto de páginas adjacentes
    if (pageAssets.length > 0 && pageTexts.length === 0) {
      const adjacentTexts = findAdjacentTexts(page, textsByPage);
      if (adjacentTexts.length > 0) {
        blocks.push(
          buildCorrelationBlock(page, adjacentTexts, pageAssets, CorrelationConfidence.LOW, [
            CorrelationMethod.PAGE_PROXIMITY,
            CorrelationMethod.SEQUENTIAL,
          ]),
        );
      } else {
        // Imagens órfãs — criar bloco apenas com assets
        blocks.push(
          buildCorrelationBlock(page, [], pageAssets, CorrelationConfidence.INFERRED, [
            CorrelationMethod.SEQUENTIAL,
          ]),
        );
      }
      continue;
    }

    // Página só com texto → criar bloco textual (sem assets)
    if (pageTexts.length > 0) {
      blocks.push(
        buildCorrelationBlock(page, pageTexts, [], CorrelationConfidence.MEDIUM, [
          CorrelationMethod.PAGE_PROXIMITY,
        ]),
      );
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByPage<T>(items: T[], getPage: (item: T) => number): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const page = getPage(item);
    const list = map.get(page);
    if (list) {
      list.push(item);
    } else {
      map.set(page, [item]);
    }
  }
  return map;
}

function findAdjacentTexts(
  page: number,
  textsByPage: Map<number, TextBlock[]>,
): TextBlock[] {
  // Procurar na página anterior e posterior
  const prev = textsByPage.get(page - 1) ?? [];
  const next = textsByPage.get(page + 1) ?? [];

  // Preferir a página anterior (mais provável que a imagem "ilustre" o texto acima)
  if (prev.length > 0) return prev;
  if (next.length > 0) return next;
  return [];
}

function buildCorrelationBlock(
  page: number,
  textBlocks: TextBlock[],
  assets: Asset[],
  confidence: CorrelationConfidence,
  methods: CorrelationMethod[],
): CorrelationBlock {
  // Encontrar headline mais proeminente
  const headline = textBlocks
    .map((t) => t.headline)
    .find((h) => h !== undefined);

  // Gerar resumo a partir dos textos
  const summary = generateSummary(textBlocks);

  // Agregar keywords de todos os text blocks
  const allKeywords = new Set<string>();
  for (const tb of textBlocks) {
    for (const kw of tb.keywords) {
      allKeywords.add(kw);
    }
  }

  return {
    id: uuid(),
    page,
    textBlocks,
    assetIds: assets.map((a) => a.id),
    headline,
    summary,
    inferredType: undefined,       // Preenchido pelo asset-classifier
    inferredNarrativeRole: undefined, // Preenchido pelo role-inferrer
    inferredCommercialRole: undefined,
    confidence,
    methods,
    tags: [...allKeywords].slice(0, 15),
    priority: 5, // Default; ajustado depois pelo role-inferrer
  };
}

/**
 * Gera um resumo curto a partir dos text blocks.
 * v1: concatena primeiras frases. v2: IAIAdapter.
 */
function generateSummary(textBlocks: TextBlock[]): string {
  if (textBlocks.length === 0) return '';

  const firstSentences = textBlocks
    .map((tb) => {
      // Pegar primeira frase (até ponto, exclamação ou interrogação)
      const match = tb.content.match(/^(.+?[.!?])\s/);
      return match ? match[1] : tb.content.slice(0, 120);
    })
    .filter((s) => s.length > 5);

  return firstSentences.slice(0, 2).join(' ').trim();
}
