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
import {
  ProximityCalculator,
  type SpatialTextBlock,
} from './proximity-calculator.js';

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

// ============================================================================
// Sprint 2B Phase 1 — Elevação por proximidade espacial
//
// Quando a extração foi feita pelo caminho `enhanced-extraction`, os assets
// carregam `Asset.geometry` (coordenadas PDF via CTM). Nesse caso, podemos
// rodar um segundo passo OPCIONAL e ADITIVO sobre os `CorrelationBlock[]`
// já produzidos por `correlateByPage()`, elevando a confidence quando há
// match espacial concreto entre um asset e um text block da mesma página.
//
// Design:
//   - Função pura. Recebe blocks + catálogos de asset e spatial text blocks.
//     Retorna um novo array — nunca muta o input.
//   - No-op se nenhum asset do block tiver `geometry` populado.
//   - Elevação conservadora: LOW→MEDIUM, MEDIUM→HIGH, HIGH→HIGH.
//     Nunca rebaixa.
//   - Adiciona `CorrelationMethod.SPATIAL_ADJACENCY` aos `methods[]`
//     quando encontra pelo menos um match com `method !== 'none'`.
//   - Mínima confidence para elevar: 50 (corresponde a 'adjacent' no
//     `ProximityCalculator`).
//
// NÃO substitui `correlateByPage`. O caminho padrão (sem geometry) continua
// idêntico, inclusive para PDFs processados pelas estratégias antigas.
// ============================================================================

const SPATIAL_ELEVATION_MIN_CONFIDENCE = 30;

/**
 * Eleva a confidence dos blocks com base em proximidade espacial real.
 * Chame este passo APÓS `correlateByPage()` quando tiver dados espaciais
 * disponíveis (ex: text content do pdfjs-dist + assets com `geometry`).
 */
export function elevateBlocksWithSpatialMatch(
  blocks: readonly CorrelationBlock[],
  assetById: ReadonlyMap<string, Asset>,
  spatialTextByPage: ReadonlyMap<number, readonly SpatialTextBlock[]>,
): CorrelationBlock[] {
  const calculator = new ProximityCalculator();
  const result: CorrelationBlock[] = [];

  for (const block of blocks) {
    const spatialTexts = spatialTextByPage.get(block.page) ?? [];
    if (spatialTexts.length === 0) {
      result.push(block);
      continue;
    }

    let bestConfidence = 0;
    let anyMatch = false;

    for (const assetId of block.assetIds) {
      const asset = assetById.get(assetId);
      if (!asset || !asset.geometry) continue;

      const best = calculator.findBestMatch(asset, spatialTexts);
      if (best && best.confidence >= SPATIAL_ELEVATION_MIN_CONFIDENCE) {
        anyMatch = true;
        if (best.confidence > bestConfidence) bestConfidence = best.confidence;
      }
    }

    if (!anyMatch) {
      result.push(block);
      continue;
    }

    const elevated: CorrelationBlock = {
      ...block,
      confidence: promoteConfidence(block.confidence, bestConfidence),
      methods: block.methods.includes(CorrelationMethod.SPATIAL_ADJACENCY)
        ? block.methods
        : [...block.methods, CorrelationMethod.SPATIAL_ADJACENCY],
    };
    result.push(elevated);
  }

  return result;
}

/**
 * Regra de promoção:
 *   - confidence ≥ 80 (collision forte): INFERRED/LOW → HIGH; MEDIUM → HIGH
 *   - confidence 50-79 (adjacent/strong contextual): LOW → MEDIUM; MEDIUM/HIGH inalterado
 *   - Nunca rebaixa.
 */
function promoteConfidence(
  current: CorrelationConfidence,
  spatialConfidence: number,
): CorrelationConfidence {
  if (spatialConfidence >= 80) {
    if (current === CorrelationConfidence.INFERRED) return CorrelationConfidence.HIGH;
    if (current === CorrelationConfidence.LOW) return CorrelationConfidence.HIGH;
    if (current === CorrelationConfidence.MEDIUM) return CorrelationConfidence.HIGH;
    return current;
  }
  if (current === CorrelationConfidence.INFERRED) return CorrelationConfidence.LOW;
  if (current === CorrelationConfidence.LOW) return CorrelationConfidence.MEDIUM;
  return current;
}
