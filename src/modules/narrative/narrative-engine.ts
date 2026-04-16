/**
 * Narrative Engine — clustering semântico de cenas para Reel
 *
 * Consome VideoScene[] (saída do SceneComposerEnhanced) e organiza
 * em clusters narrativos por tópico: showcase, lifestyle, details, cta.
 *
 * Responsabilidades:
 *  - Identificar hook (primeira cena, maior confiança)
 *  - Clusterizar por keywords do texto
 *  - Calcular duração total respeitando limite de 60s (Reel)
 *
 * Módulo puro — sem I/O, sem side effects.
 */

import type { VideoScene } from '../media/scene-composer-enhanced.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type NarrativeTopic = 'showcase' | 'lifestyle' | 'details' | 'cta';

export interface NarrativeCluster {
  readonly topic: NarrativeTopic;
  readonly scenes: readonly VideoScene[];
  readonly totalDuration: number;
}

export interface NarrativeStoryboard {
  readonly hook: VideoScene;
  readonly clusters: readonly NarrativeCluster[];
  readonly totalDuration: number;
  readonly totalScenes: number;
}

// ---------------------------------------------------------------------------
// Keywords por tópico (pt-BR imobiliário)
// ---------------------------------------------------------------------------

const TOPIC_KEYWORDS: Readonly<Record<NarrativeTopic, readonly string[]>> = {
  showcase: ['fachada', 'exterior', 'vista', 'arquitetura', 'design', 'empreendimento'],
  lifestyle: ['piscina', 'academia', 'lazer', 'sauna', 'yoga', 'spa', 'garden', 'jardim'],
  details: ['planta', 'plano', 'metro', 'm²', 'dormitório', 'suíte', 'vaga'],
  cta: ['agende', 'visite', 'saiba', 'conheça', 'ligue', 'whatsapp', 'contato'],
};

/** Ordem de apresentação no Reel */
const TOPIC_ORDER: readonly NarrativeTopic[] = [
  'showcase',
  'lifestyle',
  'details',
  'cta',
];

/** Duração máxima de um Reel (segundos) */
const MAX_REEL_DURATION = 60;

/** Tempo de transição entre cenas (segundos) */
const TRANSITION_GAP = 0.5;

// ---------------------------------------------------------------------------
// Implementação
// ---------------------------------------------------------------------------

export class NarrativeEngine {
  /**
   * Montar storyboard narrativo a partir de cenas compostas.
   *
   * @throws Error se `scenes` estiver vazio
   */
  buildStoryboard(scenes: readonly VideoScene[]): NarrativeStoryboard {
    if (scenes.length === 0) {
      throw new Error('Cannot build storyboard with no scenes');
    }

    // Ordenar por confiança desc → página asc
    const ordered = [...scenes].sort((a, b) => {
      const confDiff = b.correlationConfidence - a.correlationConfidence;
      if (confDiff !== 0) return confDiff;
      return a.sourcePageNumber - b.sourcePageNumber;
    });

    const hook = ordered[0];
    const remaining = ordered.slice(1);

    const clusters = this.clusterize(remaining);
    const totalDuration = this.calculateTotalDuration(clusters);

    logger.info(
      `[NarrativeEngine] Storyboard: hook page=${hook.sourcePageNumber}, ` +
        `${clusters.length} clusters, ${scenes.length} scenes, ${totalDuration.toFixed(1)}s`,
    );

    return { hook, clusters, totalDuration, totalScenes: scenes.length };
  }

  // -------------------------------------------------------------------------
  // Clustering
  // -------------------------------------------------------------------------

  private clusterize(scenes: readonly VideoScene[]): NarrativeCluster[] {
    const buckets = new Map<NarrativeTopic, VideoScene[]>();

    for (const scene of scenes) {
      const topic = this.detectTopic(scene.textContent);
      if (!buckets.has(topic)) {
        buckets.set(topic, []);
      }
      buckets.get(topic)!.push(scene);
    }

    const result: NarrativeCluster[] = [];
    for (const topic of TOPIC_ORDER) {
      const topicScenes = buckets.get(topic);
      if (!topicScenes || topicScenes.length === 0) continue;

      result.push({
        topic,
        scenes: topicScenes,
        totalDuration: topicScenes.reduce(
          (sum, s) => sum + s.durationSeconds,
          0,
        ),
      });
    }

    return result;
  }

  private detectTopic(text: string): NarrativeTopic {
    const lower = text.toLowerCase();
    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        return topic as NarrativeTopic;
      }
    }
    return 'showcase'; // default
  }

  // -------------------------------------------------------------------------
  // Timing
  // -------------------------------------------------------------------------

  private calculateTotalDuration(clusters: readonly NarrativeCluster[]): number {
    let total = 0;
    for (const cluster of clusters) {
      total += cluster.totalDuration;
      total += cluster.scenes.length * TRANSITION_GAP;
    }
    return Math.min(total, MAX_REEL_DURATION);
  }
}
