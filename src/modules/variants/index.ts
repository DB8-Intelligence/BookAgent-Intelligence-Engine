/**
 * Variants Module — Variant Generation Engine
 *
 * Expõe a API pública do módulo de variantes.
 *
 * Parte 65: Variant Generation Engine
 */

export {
  buildVariantSpec,
  buildAllVariants,
  createPendingVariant,
  completeVariant,
  failVariant,
} from './variant-builder.js';

export {
  VARIANT_REEL_15S,
  VARIANT_REEL_30S,
  VARIANT_STORY,
  VARIANT_SQUARE,
  VARIANT_LANDSCAPE,
  VARIANT_WHATSAPP_LONG,
  VARIANT_REGISTRY,
  ALL_VARIANT_SPECS,
  CHANNEL_PROFILES,
} from './variant-specs.js';
