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
import type { BookPrototype } from '../../domain/entities/book-prototype.js';
import { CompositionPattern } from '../../domain/entities/book-prototype.js';
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
 *
 * Quando bookPrototype está disponível, os layout hints são refinados
 * com base nos padrões de composição detectados no book original.
 * Isso garante que os outputs respeitem o estilo editorial do material.
 */
export function composeScenes(
  beats: NarrativeBeat[],
  sources: Source[],
  assets: Asset[],
  branding?: BrandingProfile,
  bookPrototype?: BookPrototype,
): MediaScene[] {
  const sourceMap = new Map(sources.map((s) => [s.id, s]));
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const brandingInstr = buildBrandingInstruction(branding);

  // Extrair padrão dominante do book (se disponível)
  const dominantPattern = bookPrototype?.layoutPatterns?.[0]?.compositionPattern;
  const designMode = bookPrototype?.designHierarchy?.dominantMode;

  return beats.map((beat, index) => {
    const source = beat.sourceId ? sourceMap.get(beat.sourceId) : undefined;

    // Resolver assets reais (filtrar IDs que não existem)
    const resolvedAssetIds = beat.suggestedAssetIds.filter((id) => assetMap.has(id));

    // Gerar text overlays
    const textOverlays = buildTextOverlays(beat, source);

    // Determinar layout — refinado pelo bookPrototype quando disponível
    const hasVisuals = resolvedAssetIds.length > 0 && beat.showVisuals;
    const layoutHint = determineLayout(
      beat.role, hasVisuals, resolvedAssetIds.length,
      dominantPattern, designMode,
    );

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

/** Mapeia CompositionPattern do book para LayoutHint de mídia */
const COMPOSITION_TO_LAYOUT: Partial<Record<CompositionPattern, LayoutHint>> = {
  [CompositionPattern.FULL_BLEED_OVERLAY]: LayoutHint.FULL_BLEED,
  [CompositionPattern.SPLIT_HORIZONTAL]: LayoutHint.SPLIT_HORIZONTAL,
  [CompositionPattern.SPLIT_VERTICAL]: LayoutHint.SPLIT_VERTICAL,
  [CompositionPattern.GRID]: LayoutHint.GRID,
  [CompositionPattern.TEXT_CENTERED]: LayoutHint.TEXT_CENTERED,
  [CompositionPattern.SINGLE_COLUMN]: LayoutHint.SPLIT_VERTICAL,
  [CompositionPattern.TWO_COLUMN]: LayoutHint.SPLIT_HORIZONTAL,
  [CompositionPattern.INSET]: LayoutHint.OVERLAY,
  [CompositionPattern.MINIMAL]: LayoutHint.MINIMAL,
  [CompositionPattern.CARD_BLOCK]: LayoutHint.OVERLAY,
};

function determineLayout(
  role: BeatRole,
  hasVisuals: boolean,
  assetCount: number,
  dominantPattern?: CompositionPattern,
  designMode?: 'image-first' | 'text-first' | 'balanced',
): LayoutHint {
  // No visuals → text centered
  if (!hasVisuals) return LayoutHint.TEXT_CENTERED;

  // Multiple assets → grid
  if (assetCount >= 3) return LayoutHint.GRID;

  // Role-based default
  const roleDefault = ROLE_LAYOUT[role] ?? LayoutHint.OVERLAY;

  // Se não há bookPrototype, usar apenas role-based
  if (!dominantPattern) return roleDefault;

  // Com bookPrototype: refinar com base no estilo do book
  // Para HOOK e SHOWCASE: respeitar o padrão dominante do book
  if (role === BeatRole.HOOK || role === BeatRole.SHOWCASE || role === BeatRole.LIFESTYLE) {
    const bookLayout = COMPOSITION_TO_LAYOUT[dominantPattern];
    if (bookLayout) return bookLayout;
  }

  // Para image-first books: preferir full-bleed em cenas visuais
  if (designMode === 'image-first' && hasVisuals) {
    if (role !== BeatRole.CTA && role !== BeatRole.SOCIAL_PROOF) {
      return LayoutHint.FULL_BLEED;
    }
  }

  // Para text-first books: preferir overlays e splits
  if (designMode === 'text-first' && hasVisuals) {
    if (roleDefault === LayoutHint.FULL_BLEED) {
      return LayoutHint.OVERLAY;
    }
  }

  return roleDefault;
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
