/**
 * Presets Module — Video Preset Engine
 *
 * Expõe a API pública do módulo de presets.
 *
 * Parte 63: Preset Engine
 */

export {
  resolvePreset,
  resolvePresetById,
  inferPreset,
  toRenderMotionProfile,
  toRenderTransitionProfile,
} from './preset-resolver.js';

export {
  PRESET_LUXURY,
  PRESET_CORPORATE,
  PRESET_FAST_SALES,
  PRESET_REGISTRY,
  ALL_PRESETS,
} from './preset-catalog.js';
