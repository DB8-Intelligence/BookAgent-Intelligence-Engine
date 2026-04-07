/**
 * Variant Builder — Variant Generation Engine
 *
 * Gera múltiplas variantes de um RenderSpec base.
 *
 * Cada variante aplica overrides leves:
 *   1. Seleciona cenas (por duração alvo / maxScenes)
 *   2. Ajusta resolução e aspect ratio
 *   3. Aplica preset padrão da variante
 *   4. Filtra text overlays por densidade
 *
 * Reutiliza o mesmo conteúdo narrativo — sem duplicar lógica.
 *
 * Parte 65: Variant Generation Engine
 */

import type { RenderSpec, RenderSceneSpec } from '../../types/render-spec.js';
import type { VariantSpec, OutputVariant } from '../../domain/entities/variant.js';
import { VariantStatus, TextDensity } from '../../domain/entities/variant.js';
import { resolvePreset } from '../presets/index.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Gera um RenderSpec adaptado para uma variante específica.
 * Aplica overrides leves sobre o spec base.
 */
export function buildVariantSpec(
  baseSpec: RenderSpec,
  variant: VariantSpec,
): RenderSpec {
  // 1. Selecionar cenas
  const scenes = selectScenes(baseSpec.scenes, variant);

  // 2. Filtrar text overlays por densidade
  const filteredScenes = scenes.map((scene) => filterTextByDensity(scene, variant.textDensity));

  // 3. Calcular duração total
  const totalDuration = filteredScenes.reduce(
    (sum, s) => sum + (s.durationSeconds ?? 4),
    0,
  );

  // 4. Resolver preset da variante
  const presetResult = variant.defaultPresetId
    ? resolvePreset(baseSpec.format, undefined, variant.defaultPresetId)
    : { presetId: baseSpec.presetId ?? null, motionProfile: baseSpec.motionProfile ?? null, transitionProfile: baseSpec.transitionProfile ?? null };

  logger.info(
    `[VariantBuilder] Built variant "${variant.name}": ` +
    `${filteredScenes.length}/${baseSpec.scenes.length} scenes, ` +
    `${totalDuration}s, ${variant.resolution[0]}x${variant.resolution[1]}`,
  );

  return {
    ...baseSpec,
    version: baseSpec.version,
    format: `${baseSpec.format}__${variant.id}`,
    aspectRatio: variant.aspectRatio,
    resolution: variant.resolution,
    totalDurationSeconds: totalDuration,
    scenes: filteredScenes,
    presetId: presetResult.presetId,
    motionProfile: presetResult.motionProfile,
    transitionProfile: presetResult.transitionProfile,
    metadata: {
      ...baseSpec.metadata,
      variantId: variant.id,
      variantChannel: variant.channel,
      baseSceneCount: baseSpec.scenes.length,
    },
  };
}

/**
 * Gera todos os RenderSpecs variantes a partir de um spec base e uma lista de variant specs.
 * Retorna pares [VariantSpec, RenderSpec].
 */
export function buildAllVariants(
  baseSpec: RenderSpec,
  variants: VariantSpec[],
): Array<{ variant: VariantSpec; spec: RenderSpec }> {
  // Ordenar por prioridade
  const sorted = [...variants].sort((a, b) => a.priority - b.priority);

  return sorted.map((variant) => ({
    variant,
    spec: buildVariantSpec(baseSpec, variant),
  }));
}

/**
 * Cria um OutputVariant inicial (status PENDING) para tracking.
 */
export function createPendingVariant(variant: VariantSpec): OutputVariant {
  return {
    variantSpecId: variant.id,
    name: variant.name,
    channel: variant.channel,
    status: VariantStatus.PENDING,
    warnings: [],
  };
}

/**
 * Marca uma OutputVariant como completada.
 */
export function completeVariant(
  base: OutputVariant,
  result: {
    outputPath: string;
    filename: string;
    sizeBytes: number;
    durationSeconds: number;
    resolution: [number, number];
    sceneCount: number;
    warnings: string[];
  },
): OutputVariant {
  return {
    ...base,
    status: VariantStatus.COMPLETED,
    outputPath: result.outputPath,
    filename: result.filename,
    sizeBytes: result.sizeBytes,
    durationSeconds: result.durationSeconds,
    resolution: result.resolution,
    sceneCount: result.sceneCount,
    warnings: [...base.warnings, ...result.warnings],
  };
}

/**
 * Marca uma OutputVariant como falhada.
 */
export function failVariant(base: OutputVariant, error: string): OutputVariant {
  return {
    ...base,
    status: VariantStatus.FAILED,
    error,
  };
}

// ---------------------------------------------------------------------------
// Scene selection
// ---------------------------------------------------------------------------

/**
 * Seleciona cenas do spec base respeitando duração e maxScenes da variante.
 *
 * Estratégia:
 *   - Prioriza cenas essenciais: HOOK (sempre), CTA (sempre), SHOWCASE
 *   - Preenche restante por ordem natural
 *   - Respeita targetDurationSeconds e maxScenes
 */
function selectScenes(
  allScenes: RenderSceneSpec[],
  variant: VariantSpec,
): RenderSceneSpec[] {
  // Se sem limites, retorna todas
  if (!variant.targetDurationSeconds && !variant.maxScenes) {
    return allScenes;
  }

  const maxScenes = variant.maxScenes ?? allScenes.length;
  const maxDuration = variant.targetDurationSeconds ?? Infinity;

  // Classificar cenas por prioridade
  const prioritized = [...allScenes].sort((a, b) => {
    return scenePriority(a.role) - scenePriority(b.role);
  });

  const selected: RenderSceneSpec[] = [];
  let totalDuration = 0;

  for (const scene of prioritized) {
    if (selected.length >= maxScenes) break;

    const sceneDuration = scene.durationSeconds ?? 4;
    if (totalDuration + sceneDuration > maxDuration && selected.length > 0) {
      continue; // Pula se excede duração (mas aceita pelo menos 1)
    }

    selected.push(scene);
    totalDuration += sceneDuration;
  }

  // Re-ordenar por order original
  selected.sort((a, b) => a.order - b.order);

  // Re-indexar orders sequencialmente
  return selected.map((scene, i) => ({
    ...scene,
    order: i,
  }));
}

/** Prioridade por role — menor = mais importante */
function scenePriority(role: string): number {
  switch (role) {
    case 'hook': return 0;
    case 'cta': return 1;
    case 'showcase': return 2;
    case 'differentiator': return 3;
    case 'lifestyle': return 4;
    case 'context': return 5;
    case 'social-proof': return 6;
    case 'investment': return 7;
    case 'reinforcement': return 8;
    case 'closing': return 9;
    default: return 10;
  }
}

// ---------------------------------------------------------------------------
// Text density filtering
// ---------------------------------------------------------------------------

function filterTextByDensity(
  scene: RenderSceneSpec,
  density: TextDensity,
): RenderSceneSpec {
  if (density === TextDensity.DENSE) return scene; // Keep all

  const allowedRoles = density === TextDensity.MINIMAL
    ? ['headline', 'cta']
    : ['headline', 'body', 'cta']; // NORMAL

  return {
    ...scene,
    textOverlays: scene.textOverlays.filter((o) => allowedRoles.includes(o.role)),
  };
}
