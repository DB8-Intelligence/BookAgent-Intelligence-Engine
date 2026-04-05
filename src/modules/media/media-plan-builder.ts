/**
 * Media Plan Builder
 *
 * Monta MediaPlans completos a partir de OutputDecisions aprovadas
 * e seus NarrativePlans associados.
 *
 * Para cada output aprovado:
 * 1. Localiza o NarrativePlan correspondente
 * 2. Compõe cenas via scene-composer
 * 3. Resolve aspect ratio e resoluç��o via OutputSpec
 * 4. Calcula duração total e contagem de slides
 * 5. Avalia render readiness
 * 6. Monta o MediaPlan final
 */

import { v4 as uuid } from 'uuid';
import type { OutputDecision } from '../../domain/entities/output-decision.js';
import { ApprovalStatus } from '../../domain/entities/output-decision.js';
import type { NarrativePlan } from '../../domain/entities/narrative.js';
import type { BrandingProfile } from '../../domain/entities/branding.js';
import type { Source } from '../../domain/entities/source.js';
import type { Asset } from '../../domain/entities/asset.js';
import type { MediaPlan, MediaScene } from '../../domain/entities/media-plan.js';
import { RenderStatus } from '../../domain/entities/media-plan.js';
import { OUTPUT_SPECS } from '../../domain/entities/output-spec.js';
import type { AspectRatio } from '../../domain/value-objects/index.js';
import { ASPECT_RATIOS } from '../../domain/value-objects/index.js';
import type { BookPrototype } from '../../domain/entities/book-prototype.js';

import { composeScenes } from './scene-composer.js';
import { logger } from '../../utils/logger.js';

/** Formatos que são visuais/audiovisuais (vs puramente textuais) */
const MEDIA_FORMATS = new Set([
  'reel', 'video_short', 'video_long', 'story',
  'carousel', 'post', 'presentation',
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Constrói MediaPlans para todos os outputs aprovados que são de mídia visual.
 */
export function buildMediaPlans(
  decisions: OutputDecision[],
  narratives: NarrativePlan[],
  sources: Source[],
  assets: Asset[],
  branding?: BrandingProfile,
  bookPrototype?: BookPrototype,
): MediaPlan[] {
  const narrativeMap = new Map(narratives.map((n) => [n.id, n]));

  // Filtrar apenas outputs aprovados que são de mídia visual
  const approvedMedia = decisions.filter(
    (d) =>
      (d.status === ApprovalStatus.APPROVED || d.status === ApprovalStatus.APPROVED_WITH_GAPS) &&
      MEDIA_FORMATS.has(d.format),
  );

  const plans: MediaPlan[] = [];

  for (const decision of approvedMedia) {
    const narrative = narrativeMap.get(decision.narrativePlanId);
    if (!narrative) {
      logger.warn(
        `[MediaPlanBuilder] Narrative plan "${decision.narrativePlanId}" not found for approved decision ` +
        `"${decision.id}" (format=${decision.format}). Skipping.`
      );
      continue;
    }

    const plan = buildSinglePlan(decision, narrative, sources, assets, branding, bookPrototype);
    plans.push(plan);
  }

  // Ordenar por prioridade da decisão
  plans.sort((a, b) => {
    const decA = decisions.find((d) => d.id === a.outputDecisionId);
    const decB = decisions.find((d) => d.id === b.outputDecisionId);
    return (decA?.priority ?? 99) - (decB?.priority ?? 99);
  });

  return plans;
}

// ---------------------------------------------------------------------------
// Single plan builder
// ---------------------------------------------------------------------------

function buildSinglePlan(
  decision: OutputDecision,
  narrative: NarrativePlan,
  sources: Source[],
  assets: Asset[],
  branding?: BrandingProfile,
  bookPrototype?: BookPrototype,
): MediaPlan {
  // Compor cenas — com inteligência do bookPrototype quando disponível
  const scenes = composeScenes(narrative.beats, sources, assets, branding, bookPrototype);

  // Resolver aspect ratio e resolução
  const specKey = formatToSpecKey(decision.format);
  const spec = OUTPUT_SPECS[specKey];
  const aspectRatio = spec?.aspectRatio ?? ASPECT_RATIOS.PORTRAIT_9_16;
  const resolution = spec?.resolution ?? [1080, 1920];

  // Calcular totais
  const isVideo = hasVideoDuration(decision.format);
  const totalDuration = isVideo
    ? scenes.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0) || null
    : null;
  const totalSlides = !isVideo ? scenes.length : null;

  // Avaliar render readiness
  const renderStatus = evaluateRenderStatus(scenes);

  return {
    id: uuid(),
    format: decision.format,
    narrativeType: narrative.narrativeType,
    narrativePlanId: narrative.id,
    outputDecisionId: decision.id,
    title: narrative.title,
    scenes,
    aspectRatio: aspectRatio as AspectRatio,
    resolution: resolution as [number, number],
    totalDurationSeconds: totalDuration,
    totalSlides: totalSlides,
    renderStatus,
    requiresPersonalization: decision.requiresPersonalization,
    renderMetadata: {
      tone: narrative.tone,
      confidence: decision.confidence,
      complexity: decision.complexity,
      sourceCount: narrative.sourceIds.length,
      visualStyle: branding?.style ?? 'minimal',
    },
  };
}

// ---------------------------------------------------------------------------
// Render readiness
// ---------------------------------------------------------------------------

function evaluateRenderStatus(scenes: MediaScene[]): RenderStatus {
  if (scenes.length === 0) return RenderStatus.NOT_READY;

  let scenesWithAssets = 0;
  let scenesWithText = 0;
  let visualScenesWithoutAssets = 0;

  for (const scene of scenes) {
    if (scene.assetIds.length > 0) scenesWithAssets++;
    if (scene.textOverlays.length > 0) scenesWithText++;

    // Cenas que deveriam ter visuais mas não têm
    if (scene.layoutHint !== 'text-centered' && scene.assetIds.length === 0) {
      visualScenesWithoutAssets++;
    }
  }

  // Todas as cenas têm assets E texto → READY
  if (scenesWithAssets === scenes.length && scenesWithText >= scenes.length * 0.5) {
    return RenderStatus.READY;
  }

  // Faltam assets em cenas visuais
  if (visualScenesWithoutAssets > scenes.length * 0.3) {
    return RenderStatus.NEEDS_ASSETS;
  }

  // Faltam textos
  if (scenesWithText < scenes.length * 0.3) {
    return RenderStatus.NEEDS_TEXT;
  }

  // Parcialmente pronto
  return RenderStatus.PARTIAL;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatToSpecKey(format: string): string {
  return format;
}

function hasVideoDuration(format: string): boolean {
  return ['reel', 'video_short', 'video_long', 'story'].includes(format);
}
