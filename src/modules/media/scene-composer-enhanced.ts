/**
 * SceneComposerEnhanced — compor cenas de vídeo respeitando Z-Index do PDF
 *
 * Diferente do SceneComposer padrão (que trabalha com BeatRole e MediaScene),
 * este módulo consome CorrelationBlocks + Assets e gera VideoScenes otimizadas
 * para o pipeline de vídeo (Ken Burns, pan-scan, safe crop).
 *
 * Responsabilidades:
 *  - Ordenar assets pelo Z-Index (hierarquia visual original do PDF)
 *  - Selecionar motion profile por tipo de asset (hero → ken-burns)
 *  - Calcular duração por word count do texto correlacionado
 *  - Extrair POI (preenchido pelo POIDetector em etapa posterior)
 */

import type { Asset } from '../../domain/entities/asset.js';
import type {
  CorrelationBlock,
  CorrelationConfidence,
} from '../../domain/entities/correlation.js';
import { SourceType } from '../../domain/value-objects/index.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface VideoScene {
  readonly id: string;
  readonly sequenceOrder: number;
  readonly assetId: string;
  readonly textContent: string;
  readonly durationSeconds: number;
  readonly sourcePageNumber: number;
  readonly correlationConfidence: number;
  readonly motionProfile: 'ken-burns' | 'pan-scan' | 'static';
  readonly poiX?: number; // 0-1 normalizado
  readonly poiY?: number;
}

// ---------------------------------------------------------------------------
// Implementação
// ---------------------------------------------------------------------------

export class SceneComposerEnhanced {
  /**
   * Compor cenas respeitando Z-Index do PDF.
   *
   * @param correlationBlocks - blocos semânticos correlacionados
   * @param assetById - catálogo de assets indexado por id
   * @returns cenas ordenadas prontas para narrative engine
   */
  composeScenes(
    correlationBlocks: readonly CorrelationBlock[],
    assetById: ReadonlyMap<string, Asset>,
  ): readonly VideoScene[] {
    const scenes: VideoScene[] = [];
    let sequenceOrder = 0;

    // Ordenar blocks por página
    const sortedBlocks = [...correlationBlocks].sort(
      (a, b) => a.page - b.page,
    );

    for (const block of sortedBlocks) {
      // Ordenar assets pelo Z-Index dentro do block
      const assetsInBlock = block.assetIds
        .map((id) => assetById.get(id))
        .filter((a): a is Asset => !!a)
        .sort((a, b) => {
          const zA = a.geometry?.zIndex ?? 0;
          const zB = b.geometry?.zIndex ?? 0;
          return zA - zB;
        });

      for (const asset of assetsInBlock) {
        const textContent = block.summary || block.headline || '';
        if (!textContent) continue;

        scenes.push({
          id: uuid(),
          sequenceOrder,
          assetId: asset.id,
          textContent,
          durationSeconds: this.calculateDuration(textContent),
          sourcePageNumber: block.page,
          correlationConfidence: this.confidenceToNumber(block.confidence),
          motionProfile: this.selectMotionProfile(asset),
          poiX: asset.position?.x,
          poiY: asset.position?.y,
        });

        sequenceOrder++;
      }
    }

    logger.info(`[SceneComposerEnhanced] Composed ${scenes.length} video scenes`);
    return scenes;
  }

  /**
   * Motion profile baseado em tipo + aspect ratio do asset.
   */
  private selectMotionProfile(
    asset: Asset,
  ): 'ken-burns' | 'pan-scan' | 'static' {
    // Hero shots → Ken Burns (zoom focado)
    if (asset.classification === SourceType.HERO) {
      return 'ken-burns';
    }

    // Imagens muito horizontais → Pan-Scan
    if (asset.geometry) {
      const ratio = asset.geometry.width / asset.geometry.height;
      if (ratio > 1.5) {
        return 'pan-scan';
      }
    }

    return 'static';
  }

  /**
   * Duração baseada em word count (~3 words/s leitura rápida).
   */
  private calculateDuration(textContent: string): number {
    const wordCount = textContent.split(/\s+/).length;
    return Math.max(2, Math.min(8, wordCount / 3));
  }

  /**
   * Converter CorrelationConfidence enum → número 0-1.
   */
  private confidenceToNumber(confidence: CorrelationConfidence): number {
    const map: Record<string, number> = {
      high: 0.95,
      medium: 0.75,
      low: 0.5,
      inferred: 0.3,
    };
    return map[confidence] ?? 0;
  }
}
