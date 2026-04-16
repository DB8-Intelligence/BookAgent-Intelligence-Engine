/**
 * StoryboardBuilder — transforma NarrativeStoryboard em frames renderizáveis
 *
 * Consome a saída do NarrativeEngine e gera StoryboardOutput com:
 *  - Safe crop 9:16 via VideoGeometry.calculateSafeCrop()
 *  - Timing por frame (hook = 4s, demais = word-based)
 *  - POI propagado do asset
 *  - Motion profile propagado da cena
 *
 * Módulo puro — sem I/O, sem side effects.
 */

import type { NarrativeStoryboard } from '../narrative/narrative-engine.js';
import type { VideoScene } from './scene-composer-enhanced.js';
import { VideoGeometry, type CropRect } from '../../renderers/video/utils/crop-logic.js';
import type { Dimensions } from '../../domain/value-objects/index.js';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface StoryboardFrame {
  readonly id: string;
  readonly sequenceOrder: number;
  readonly assetId: string;
  readonly assetPath: string;
  readonly textContent: string;
  readonly durationMs: number;
  readonly transitionDurationMs: number;
  readonly cropGeometry: CropRect;
  readonly motionProfile: 'ken-burns' | 'pan-scan' | 'static';
  readonly poiX: number;
  readonly poiY: number;
}

export interface StoryboardOutput {
  readonly id: string;
  readonly jobId: string;
  readonly frames: readonly StoryboardFrame[];
  readonly totalDurationMs: number;
  readonly metadata: {
    readonly format: '9:16';
    readonly resolution: '1080x1920';
    readonly fps: 30;
  };
}

/** Duração máxima de um Reel em ms */
const MAX_DURATION_MS = 60_000;

// ---------------------------------------------------------------------------
// Implementação
// ---------------------------------------------------------------------------

export class StoryboardBuilder {
  /**
   * Construir storyboard renderizável a partir de narrativa.
   */
  buildStoryboard(
    jobId: string,
    narrative: NarrativeStoryboard,
    assetDimensions: ReadonlyMap<string, Dimensions>,
  ): StoryboardOutput {
    const frames: StoryboardFrame[] = [];
    let seq = 0;

    // Hook
    frames.push(this.buildFrame(narrative.hook, seq++, assetDimensions, true));

    // Clusters
    for (const cluster of narrative.clusters) {
      for (const scene of cluster.scenes) {
        frames.push(this.buildFrame(scene, seq++, assetDimensions));
      }
    }

    // Otimizar para max 60s
    this.optimizeDuration(frames, MAX_DURATION_MS);

    const totalDurationMs = frames.reduce(
      (sum, f) => sum + f.durationMs + f.transitionDurationMs,
      0,
    );

    return {
      id: uuid(),
      jobId,
      frames,
      totalDurationMs,
      metadata: { format: '9:16', resolution: '1080x1920', fps: 30 },
    };
  }

  // -------------------------------------------------------------------------
  // Frame builder
  // -------------------------------------------------------------------------

  private buildFrame(
    scene: VideoScene,
    sequenceOrder: number,
    assetDimensions: ReadonlyMap<string, Dimensions>,
    isHook = false,
  ): StoryboardFrame {
    const dims = assetDimensions.get(scene.assetId) ?? {
      width: 1200,
      height: 800,
    };

    const poi = { x: scene.poiX ?? 0.5, y: scene.poiY ?? 0.5 };
    const cropGeometry = VideoGeometry.calculateSafeCrop(dims, '9:16', poi);

    // Hook = 4s fixo; demais = baseado em texto (min 2s, max 8s)
    const baseDuration = isHook
      ? 4000
      : Math.max(
          2000,
          Math.min(8000, (scene.textContent.length / 15) * 1000),
        );

    return {
      id: uuid(),
      sequenceOrder,
      assetId: scene.assetId,
      assetPath: `assets/${scene.assetId}.jpg`,
      textContent: scene.textContent,
      durationMs: baseDuration,
      transitionDurationMs: 500,
      cropGeometry,
      motionProfile: scene.motionProfile,
      poiX: poi.x,
      poiY: poi.y,
    };
  }

  // -------------------------------------------------------------------------
  // Duration optimizer
  // -------------------------------------------------------------------------

  private optimizeDuration(
    frames: StoryboardFrame[],
    maxDurationMs: number,
  ): void {
    const totalDuration = frames.reduce(
      (sum, f) => sum + f.durationMs + f.transitionDurationMs,
      0,
    );

    if (totalDuration <= maxDurationMs) return;

    const ratio = maxDurationMs / totalDuration;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      // Mutable cast — frames[] é array local, não readonly aqui
      (frames[i] as { durationMs: number }).durationMs = Math.max(
        2000,
        f.durationMs * ratio,
      );
    }
  }
}
