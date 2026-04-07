/**
 * Preset Resolver — Maps output context to the best VideoPreset
 *
 * Resolves which preset to apply based on:
 *   - Output format (reel, video_long, story, etc.)
 *   - Tone of voice (aspiracional, urgente, institucional, etc.)
 *   - Explicit preset ID (override)
 *
 * Parte 63: Preset Engine
 */

import type { VideoPreset } from '../../domain/entities/video-preset.js';
import type { RenderMotionProfile, RenderTransitionProfile } from '../../types/render-spec.js';
import { ToneOfVoice } from '../../domain/entities/narrative.js';
import { PRESET_REGISTRY } from './preset-catalog.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve o preset pelo ID explícito.
 * Retorna null se não encontrado.
 */
export function resolvePresetById(presetId: string): VideoPreset | null {
  return PRESET_REGISTRY[presetId] ?? null;
}

/**
 * Infere o melhor preset para um formato de output + tom de voz.
 * Retorna null se nenhum preset for adequado (usa defaults do sistema).
 */
export function inferPreset(format: string, tone?: ToneOfVoice): VideoPreset | null {
  // Explicit mappings por formato + tom
  if (tone === ToneOfVoice.ASPIRACIONAL) {
    return PRESET_REGISTRY['luxury'];
  }

  if (tone === ToneOfVoice.URGENTE) {
    return PRESET_REGISTRY['fast-sales'];
  }

  if (tone === ToneOfVoice.INSTITUCIONAL) {
    return PRESET_REGISTRY['corporate'];
  }

  // Format-based fallback
  switch (format) {
    case 'reel':
    case 'story':
      return PRESET_REGISTRY['fast-sales'];
    case 'video_long':
    case 'presentation':
      return PRESET_REGISTRY['corporate'];
    default:
      return null; // Sem preset — usa defaults do sistema
  }
}

/**
 * Converte um VideoPreset em RenderMotionProfile para o RenderSpec.
 */
export function toRenderMotionProfile(preset: VideoPreset): RenderMotionProfile {
  return {
    defaultSceneDuration: preset.motion.defaultSceneDuration,
    motionIntensity: preset.motion.intensity,
    kenBurnsEnabled: preset.motion.kenBurnsEnabled,
    kenBurnsZoomFactor: preset.motion.kenBurnsZoomFactor,
  };
}

/**
 * Converte um VideoPreset em RenderTransitionProfile para o RenderSpec.
 */
export function toRenderTransitionProfile(preset: VideoPreset): RenderTransitionProfile {
  return {
    defaultTransition: preset.transition.defaultTransition,
    transitionDuration: preset.transition.transitionDuration,
    allowedTransitions: [...preset.transition.allowedTransitions],
  };
}

/**
 * Resolve preset completo: por ID explícito ou inferência.
 * Retorna o preset e os profiles prontos para o RenderSpec.
 */
export function resolvePreset(
  format: string,
  tone?: ToneOfVoice,
  explicitPresetId?: string,
): {
  preset: VideoPreset | null;
  presetId: string | null;
  motionProfile: RenderMotionProfile | null;
  transitionProfile: RenderTransitionProfile | null;
} {
  let preset: VideoPreset | null = null;

  // 1. Explicit override
  if (explicitPresetId) {
    preset = resolvePresetById(explicitPresetId);
    if (!preset) {
      logger.warn(`[PresetResolver] Preset "${explicitPresetId}" not found — falling back to inference`);
    }
  }

  // 2. Infer from context
  if (!preset) {
    preset = inferPreset(format, tone);
  }

  if (!preset) {
    return { preset: null, presetId: null, motionProfile: null, transitionProfile: null };
  }

  logger.info(`[PresetResolver] Resolved preset: "${preset.name}" for format=${format} tone=${tone ?? 'default'}`);

  return {
    preset,
    presetId: preset.id,
    motionProfile: toRenderMotionProfile(preset),
    transitionProfile: toRenderTransitionProfile(preset),
  };
}
