/**
 * Thumbnail Builder — Thumbnail/Cover Engine
 *
 * Constrói ThumbnailSpec a partir de RenderSpec + Assets + Branding.
 *
 * Estratégia de seleção do frame base:
 *   1. Cena HOOK com asset (primeira impressão)
 *   2. Cena SHOWCASE com asset (destaque visual)
 *   3. Cena LIFESTYLE com asset
 *   4. Qualquer cena com asset (first available)
 *   5. Fallback: TEXT_ONLY (sem imagem)
 *
 * Headline: usa o primeiro text overlay da cena HOOK ou CTA.
 *
 * Parte 66: Thumbnail/Cover Engine
 */

import type { RenderSpec, RenderSceneSpec } from '../../types/render-spec.js';
import type { BrandingProfile } from '../../domain/entities/branding.js';
import type { ThumbnailSpec, CoverStyle } from '../../domain/entities/thumbnail.js';
import {
  CoverLayout,
  ThumbnailFormat,
  DEFAULT_COVER_STYLE,
  THUMBNAIL_SIZES,
} from '../../domain/entities/thumbnail.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Roles priorizados para seleção de frame base (ordem de preferência) */
const HERO_ROLES = ['hook', 'showcase', 'lifestyle', 'differentiator', 'context'];

/** Roles priorizados para headline (ordem de preferência) */
const HEADLINE_ROLES = ['hook', 'cta', 'showcase', 'differentiator'];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Constrói ThumbnailSpecs para um RenderSpec.
 * Gera specs para portrait (9:16) e square (1:1) por padrão.
 */
export function buildThumbnailSpecs(
  spec: RenderSpec,
  assetMap: Map<string, string>,
  branding?: BrandingProfile | null,
): ThumbnailSpec[] {
  const heroScene = selectHeroScene(spec.scenes, assetMap);
  const headline = extractHeadline(spec.scenes);
  const ctaText = extractCTA(spec.scenes);
  const style = buildCoverStyle(spec, branding);

  // Resolver asset base
  let baseAssetId: string | undefined;
  let baseAssetPath: string | undefined;

  if (heroScene) {
    const allIds = heroScene.assetIds ?? (heroScene.assetId ? [heroScene.assetId] : []);
    for (const id of allIds) {
      const path = assetMap.get(id);
      if (path) {
        baseAssetId = id;
        baseAssetPath = path;
        break;
      }
    }
  }

  const layout = baseAssetPath ? CoverLayout.FULL_BLEED_BOTTOM : CoverLayout.TEXT_ONLY;
  const logoPath = spec.branding.logoUrl ?? undefined;

  const sizes: Array<{ width: number; height: number; label: string }> = [
    THUMBNAIL_SIZES.PORTRAIT,
    THUMBNAIL_SIZES.SQUARE,
  ];

  // Add landscape for video_long / presentation / youtube formats
  if (['video_long', 'presentation'].includes(spec.format) || spec.aspectRatio === '16:9') {
    sizes.push(THUMBNAIL_SIZES.LANDSCAPE);
  }

  const specs: ThumbnailSpec[] = sizes.map((size) => ({
    width: size.width,
    height: size.height,
    layout,
    style,
    headline: headline || spec.format.replace(/_/g, ' ').toUpperCase(),
    ctaText,
    baseAssetId,
    baseAssetPath,
    logoPath,
    format: ThumbnailFormat.JPEG,
  }));

  logger.info(
    `[ThumbnailBuilder] Built ${specs.length} thumbnail specs ` +
    `(hero=${heroScene?.role ?? 'none'}, layout=${layout}, headline="${headline?.slice(0, 40) ?? 'N/A'}")`,
  );

  return specs;
}

// ---------------------------------------------------------------------------
// Scene selection
// ---------------------------------------------------------------------------

function selectHeroScene(
  scenes: RenderSceneSpec[],
  assetMap: Map<string, string>,
): RenderSceneSpec | null {
  // Try priority roles in order
  for (const role of HERO_ROLES) {
    const scene = scenes.find((s) => {
      if (s.role !== role) return false;
      const ids = s.assetIds ?? (s.assetId ? [s.assetId] : []);
      return ids.some((id) => assetMap.has(id));
    });
    if (scene) return scene;
  }

  // Fallback: any scene with an asset
  return scenes.find((s) => {
    const ids = s.assetIds ?? (s.assetId ? [s.assetId] : []);
    return ids.some((id) => assetMap.has(id));
  }) ?? null;
}

function extractHeadline(scenes: RenderSceneSpec[]): string | undefined {
  for (const role of HEADLINE_ROLES) {
    const scene = scenes.find((s) => s.role === role);
    if (scene) {
      const overlay = scene.textOverlays.find((o) => o.role === 'headline' || o.role === 'cta');
      if (overlay?.text) return overlay.text;

      // Fallback to narration headline
      if (scene.narration?.headline) return scene.narration.headline;
    }
  }

  // Last resort: first scene with any text
  for (const scene of scenes) {
    const overlay = scene.textOverlays.find((o) => o.text?.length > 2);
    if (overlay) return overlay.text;
  }

  return undefined;
}

function extractCTA(scenes: RenderSceneSpec[]): string | undefined {
  const ctaScene = scenes.find((s) => s.role === 'cta');
  if (ctaScene) {
    const overlay = ctaScene.textOverlays.find((o) => o.role === 'cta');
    if (overlay?.text) return overlay.text;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Style
// ---------------------------------------------------------------------------

function buildCoverStyle(
  spec: RenderSpec,
  branding?: BrandingProfile | null,
): CoverStyle {
  if (!branding || !branding.colors.primary) {
    // Use first scene's branding colors if available
    const firstScene = spec.scenes[0];
    if (firstScene) {
      return {
        ...DEFAULT_COVER_STYLE,
        backgroundColor: firstScene.branding.backgroundColor || DEFAULT_COVER_STYLE.backgroundColor,
        textColor: firstScene.branding.textColor || DEFAULT_COVER_STYLE.textColor,
        accentColor: firstScene.branding.accentColor || DEFAULT_COVER_STYLE.accentColor,
      };
    }
    return DEFAULT_COVER_STYLE;
  }

  return {
    ...DEFAULT_COVER_STYLE,
    backgroundColor: branding.colors.background || DEFAULT_COVER_STYLE.backgroundColor,
    textColor: branding.colors.text || DEFAULT_COVER_STYLE.textColor,
    accentColor: branding.colors.accent || DEFAULT_COVER_STYLE.accentColor,
    showLogo: true,
  };
}
