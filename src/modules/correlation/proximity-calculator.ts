/**
 * Proximity Calculator — Sprint 2B Phase 1
 *
 * Calcula score de proximidade espacial entre um asset e um bloco de texto,
 * baseado nas suas geometrias PDF (CTM-derivada pelo `PDFJSEnhancedAdapter`
 * e persistida em `Asset.geometry`).
 *
 * Classifica a relação em 3 níveis:
 *   - COLLISION  (overlap espacial, texto sobre/dentro da imagem) → conf 80-100
 *   - ADJACENT   (texto logo acima/abaixo/ao lado)                → conf 50-80
 *   - CONTEXTUAL (mesmo bloco, distância ≤ CONTEXTUAL_THRESHOLD)  → conf 20-50
 *
 * Fora dos thresholds → score 0.
 *
 * DESIGN:
 *  - Função pura, stateless. Zero dependência de banco, I/O, cache.
 *  - Usa apenas `Asset.geometry` (opcional) — se ausente, retorna score 0
 *    com método 'none' e o consumidor cai para heurística de página (o
 *    `page-correlator.ts` existente continua funcionando sem mudanças).
 *  - Coordenadas PDF usam origem no canto inferior-esquerdo, unidades em
 *    pontos (1pt = 1/72 inch). Ambos asset e text block devem estar no
 *    mesmo espaço (mesma página) para o cálculo fazer sentido.
 *
 * NÃO duplica o `PageCorrelator` existente — é um *complemento* opcional
 * que o correlator pode chamar quando `asset.geometry` estiver populado.
 */

import type { Asset } from '../../domain/entities/asset.js';

// ----------------------------------------------------------------------------
// Tipos públicos
// ----------------------------------------------------------------------------

/**
 * Bloco de texto com geometria no espaço da página PDF. Minimal shape —
 * o consumidor mapeia sua representação (TextBlock, item de pdfjs
 * `getTextContent`, etc.) para este shape antes de chamar o calculator.
 */
export interface SpatialTextBlock {
  readonly id: string;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly text: string;
}

export type ProximityMethod = 'collision' | 'adjacent' | 'contextual' | 'none';

export interface ProximityScore {
  readonly assetId: string;
  readonly textBlockId: string;
  readonly method: ProximityMethod;
  /** 0-100. `0` quando `method === 'none'`. */
  readonly confidence: number;
  /** Distância em pontos PDF. `0` para colisão, `Infinity` para páginas diferentes. */
  readonly distance: number;
}

// ----------------------------------------------------------------------------
// Thresholds (ajustar com calibração contra PDFs reais em Sprint 3)
// ----------------------------------------------------------------------------

const COLLISION_OVERLAP_MIN = 0.01;   // qualquer sobreposição ≥1% = colisão
const ADJACENT_THRESHOLD_PT = 50;     // até 50pt (~0.7cm a 72dpi)
const CONTEXTUAL_THRESHOLD_PT = 300;  // até 300pt (~10.6cm a 72dpi)

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export class ProximityCalculator {
  /**
   * Calcula o score de proximidade entre UM asset e UM text block.
   * Retorna sempre uma estrutura válida — zero exceções em caminho normal.
   */
  calculate(asset: Asset, textBlock: SpatialTextBlock): ProximityScore {
    // Sem geometria persistida → não há como medir espacialmente.
    if (!asset.geometry) {
      return {
        assetId: asset.id,
        textBlockId: textBlock.id,
        method: 'none',
        confidence: 0,
        distance: Infinity,
      };
    }

    // Páginas diferentes → distância infinita.
    if (asset.geometry.page !== textBlock.page) {
      return {
        assetId: asset.id,
        textBlockId: textBlock.id,
        method: 'none',
        confidence: 0,
        distance: Infinity,
      };
    }

    const assetRect: Rect = {
      left: asset.geometry.x,
      bottom: asset.geometry.y,
      right: asset.geometry.x + asset.geometry.width,
      top: asset.geometry.y + asset.geometry.height,
    };
    const textRect: Rect = {
      left: textBlock.x,
      bottom: textBlock.y,
      right: textBlock.x + textBlock.width,
      top: textBlock.y + textBlock.height,
    };

    // 1. Colisão — qualquer overlap significativo.
    const overlap = rectIntersectionArea(assetRect, textRect);
    const textArea = Math.max(1, textBlock.width * textBlock.height);
    const overlapRatio = overlap / textArea;

    if (overlapRatio >= COLLISION_OVERLAP_MIN) {
      // Quanto maior o overlap, maior a confiança (80 → 100)
      const confidence = Math.round(80 + Math.min(20, overlapRatio * 20));
      return {
        assetId: asset.id,
        textBlockId: textBlock.id,
        method: 'collision',
        confidence,
        distance: 0,
      };
    }

    // 2. Adjacência — distância da borda do text block à borda do asset.
    const edgeDistance = rectEdgeDistance(assetRect, textRect);

    if (edgeDistance <= ADJACENT_THRESHOLD_PT) {
      // 50-80 score em função da distância (0pt → 80, threshold → 50)
      const normalized = 1 - edgeDistance / ADJACENT_THRESHOLD_PT;
      const confidence = Math.round(50 + normalized * 30);
      return {
        assetId: asset.id,
        textBlockId: textBlock.id,
        method: 'adjacent',
        confidence,
        distance: edgeDistance,
      };
    }

    // 3. Contextual — distância centro-a-centro.
    const centerDistance = rectCenterDistance(assetRect, textRect);

    if (centerDistance <= CONTEXTUAL_THRESHOLD_PT) {
      const normalized = 1 - centerDistance / CONTEXTUAL_THRESHOLD_PT;
      const confidence = Math.round(20 + normalized * 30);
      return {
        assetId: asset.id,
        textBlockId: textBlock.id,
        method: 'contextual',
        confidence,
        distance: centerDistance,
      };
    }

    return {
      assetId: asset.id,
      textBlockId: textBlock.id,
      method: 'none',
      confidence: 0,
      distance: centerDistance,
    };
  }

  /**
   * Calcula o melhor match (maior confidence) entre UM asset e N text blocks.
   * Retorna `null` se nenhum dos blocks tiver método ≠ 'none'.
   */
  findBestMatch(
    asset: Asset,
    textBlocks: readonly SpatialTextBlock[],
  ): ProximityScore | null {
    let best: ProximityScore | null = null;
    for (const block of textBlocks) {
      const score = this.calculate(asset, block);
      if (score.method === 'none') continue;
      if (!best || score.confidence > best.confidence) {
        best = score;
      }
    }
    return best;
  }

  /**
   * Calcula todos os pares asset × text block com score ≥ minConfidence.
   * Ordem do resultado: maior confidence primeiro.
   */
  matchAll(
    assets: readonly Asset[],
    textBlocks: readonly SpatialTextBlock[],
    minConfidence: number = 30,
  ): ProximityScore[] {
    const results: ProximityScore[] = [];
    for (const asset of assets) {
      for (const block of textBlocks) {
        const score = this.calculate(asset, block);
        if (score.confidence >= minConfidence) {
          results.push(score);
        }
      }
    }
    results.sort((a, b) => b.confidence - a.confidence);
    return results;
  }
}

// ----------------------------------------------------------------------------
// Geometry helpers — funções puras
// ----------------------------------------------------------------------------

interface Rect {
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
  readonly top: number;
}

function rectIntersectionArea(a: Rect, b: Rect): number {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  const bottom = Math.max(a.bottom, b.bottom);
  const top = Math.min(a.top, b.top);
  const w = right - left;
  const h = top - bottom;
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Distância mínima entre as bordas de dois retângulos axis-aligned.
 * Retorna 0 se houver overlap.
 */
function rectEdgeDistance(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
  const dy = Math.max(0, Math.max(a.bottom - b.top, b.bottom - a.top));
  return Math.sqrt(dx * dx + dy * dy);
}

function rectCenterDistance(a: Rect, b: Rect): number {
  const ax = (a.left + a.right) / 2;
  const ay = (a.bottom + a.top) / 2;
  const bx = (b.left + b.right) / 2;
  const by = (b.bottom + b.top) / 2;
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
