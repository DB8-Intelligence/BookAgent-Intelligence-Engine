/**
 * Scene Composer
 *
 * Converte NarrativeBeat[] em MediaScene[] — cenas concretas
 * com assets posicionados, textos overlay e instruções de branding.
 *
 * Para cada beat:
 * 1. Mapeia assets sugeridos para a cena
 * 2. Gera text overlays a partir de headline e briefing
 * 3. Define layout hint baseado no papel do beat e nos assets
 * 4. Aplica instruções de branding do BrandingProfile
 * 5. Estima duração da cena
 * 6. Define transição para a próxima cena
 */

import { v4 as uuid } from 'uuid';
import type { NarrativeBeat } from '../../domain/entities/narrative.js';
import { BeatRole } from '../../domain/entities/narrative.js';
import type { BrandingProfile } from '../../domain/entities/branding.js';
import type { Source } from '../../domain/entities/source.js';
import type { Asset } from '../../domain/entities/asset.js';
import type {
  MediaScene,
  TextOverlay,
  BrandingInstruction,
} from '../../domain/entities/media-plan.js';
import { LayoutHint, TransitionType } from '../../domain/entities/media-plan.js';

// ---------------------------------------------------------------------------
// Layout mapping
// ---------------------------------------------------------------------------

/** Layout padrão por papel do beat */
const ROLE_LAYOUT: Record<BeatRole, LayoutHint> = {
  [BeatRole.HOOK]: LayoutHint.FULL_BLEED,
  [BeatRole.CONTEXT]: LayoutHint.SPLIT_VERTICAL,
  [BeatRole.SHOWCASE]: LayoutHint.FULL_BLEED,
  [BeatRole.DIFFERENTIATOR]: LayoutHint.OVERLAY,
  [BeatRole.SOCIAL_PROOF]: LayoutHint.TEXT_CENTERED,
  [BeatRole.LIFESTYLE]: LayoutHint.FULL_BLEED,
  [BeatRole.INVESTMENT]: LayoutHint.SPLIT_HORIZONTAL,
  [BeatRole.REINFORCEMENT]: LayoutHint.OVERLAY,
  [BeatRole.CLOSING]: LayoutHint.OVERLAY,
  [BeatRole.CTA]: LayoutHint.TEXT_CENTERED,
};

/** Transi��ão padrão por papel do beat */
const ROLE_TRANSITION: Record<BeatRole, TransitionType> = {
  [BeatRole.HOOK]: TransitionType.CUT,
  [BeatRole.CONTEXT]: TransitionType.FADE,
  [BeatRole.SHOWCASE]: TransitionType.SLIDE_LEFT,
  [BeatRole.DIFFERENTIATOR]: TransitionType.SLIDE_UP,
  [BeatRole.SOCIAL_PROOF]: TransitionType.FADE,
  [BeatRole.LIFESTYLE]: TransitionType.DISSOLVE,
  [BeatRole.INVESTMENT]: TransitionType.FADE,
  [BeatRole.REINFORCEMENT]: TransitionType.SLIDE_LEFT,
  [BeatRole.CLOSING]: TransitionType.FADE,
  [BeatRole.CTA]: TransitionType.ZOOM_IN,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compõe cenas a partir de beats narrativos.
 */
export function composeScenes(
  beats: NarrativeBeat[],
  sources: Source[],
  assets: Asset[],
  branding?: BrandingProfile,
): MediaScene[] {
  const sourceMap = new Map(sources.map((s) => [s.id, s]));
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const brandingInstr = buildBrandingInstruction(branding);

  return beats.map((beat, index) => {
    const source = beat.sourceId ? sourceMap.get(beat.sourceId) : undefined;

    // Resolver assets reais (filtrar IDs que não existem)
    const resolvedAssetIds = beat.suggestedAssetIds.filter((id) => assetMap.has(id));

    // Gerar text overlays
    const textOverlays = buildTextOverlays(beat, source);

    // Determinar layout
    const hasVisuals = resolvedAssetIds.length > 0 && beat.showVisuals;
    const layoutHint = determineLayout(beat.role, hasVisuals, resolvedAssetIds.length);

    // Ajustar branding por cena (CTA usa accent como background)
    const sceneBranding = beat.role === BeatRole.CTA
      ? { ...brandingInstr, backgroundColor: brandingInstr.accentColor }
      : brandingInstr;

    return {
      id: uuid(),
      order: index,
      role: beat.role,
      sourceIds: source ? [source.id] : [],
      assetIds: resolvedAssetIds,
      textOverlays,
      visualInstruction: beat.briefing,
      layoutHint,
      branding: sceneBranding,
      durationSeconds: beat.estimatedDurationSeconds ?? null,
      transition: ROLE_TRANSITION[beat.role] ?? TransitionType.CUT,
    };
  });
}

// ---------------------------------------------------------------------------
// Text overlays
// ---------------------------------------------------------------------------

function buildTextOverlays(
  beat: NarrativeBeat,
  source?: Source,
): TextOverlay[] {
  const overlays: TextOverlay[] = [];

  // Headline
  const headline = beat.suggestedHeadline ?? source?.title;
  if (headline && headline.length > 2) {
    overlays.push({
      text: headline,
      role: beat.role === BeatRole.CTA ? 'cta' : 'headline',
      position: beat.role === BeatRole.CTA ? 'center' : 'top',
      size: beat.role === BeatRole.HOOK ? 'large' : 'medium',
    });
  }

  // Supporting text (from source summary or text excerpt)
  if (source) {
    const body = source.summary ?? source.text.slice(0, 120);
    if (body && body.length > 10) {
      // Don't add body text to very short scenes or hooks
      if (beat.role !== BeatRole.HOOK && beat.role !== BeatRole.CTA) {
        overlays.push({
          text: body.length > 120 ? body.slice(0, 117) + '...' : body,
          role: 'body',
          position: 'bottom',
          size: 'small',
        });
      }
    }
  }

  // CTA specific text
  if (beat.role === BeatRole.CTA && !headline) {
    overlays.push({
      text: 'Agende sua visita',
      role: 'cta',
      position: 'center',
      size: 'large',
    });
  }

  return overlays;
}

// ---------------------------------------------------------------------------
// Layout determination
// ---------------------------------------------------------------------------

function determineLayout(
  role: BeatRole,
  hasVisuals: boolean,
  assetCount: number,
): LayoutHint {
  // No visuals → text centered
  if (!hasVisuals) return LayoutHint.TEXT_CENTERED;

  // Multiple assets → grid
  if (assetCount >= 3) return LayoutHint.GRID;

  // Default: role-based
  return ROLE_LAYOUT[role] ?? LayoutHint.OVERLAY;
}

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

function buildBrandingInstruction(branding?: BrandingProfile): BrandingInstruction {
  if (!branding || !branding.colors.primary) {
    return {
      backgroundColor: '#f5f5f5',
      textColor: '#1a1a1a',
      accentColor: '#0066cc',
      showLogo: false,
      visualStyle: 'minimal',
    };
  }

  return {
    backgroundColor: branding.colors.background,
    textColor: branding.colors.text,
    accentColor: branding.colors.accent,
    showLogo: true,
    visualStyle: String(branding.style),
  };
}
