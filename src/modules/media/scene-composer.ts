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

/** Headlines comerciais por papel — copy de venda, não títulos técnicos */
const COMMERCIAL_HEADLINES: Record<BeatRole, string> = {
  [BeatRole.HOOK]: 'Descubra o Novo',
  [BeatRole.CONTEXT]: 'Localização Privilegiada',
  [BeatRole.SHOWCASE]: 'Conheça os Ambientes',
  [BeatRole.LIFESTYLE]: 'Viva com Estilo',
  [BeatRole.DIFFERENTIATOR]: 'O Diferencial',
  [BeatRole.SOCIAL_PROOF]: 'Qualidade Comprovada',
  [BeatRole.INVESTMENT]: 'Investimento Inteligente',
  [BeatRole.REINFORCEMENT]: 'Mais Motivos para Escolher',
  [BeatRole.CLOSING]: 'O Momento é Agora',
  [BeatRole.CTA]: 'Agende Sua Visita',
};

/**
 * Extrai a parte comercial do briefing (texto do template antes do separador ` | `).
 * Ex: "Mostrar o melhor do empreendimento — fachada, áreas comuns" (sem metadata da Source).
 */
function extractBriefingCopy(briefing: string): string {
  const sep = briefing.indexOf(' | ');
  return sep > 0 ? briefing.slice(0, sep) : briefing;
}

function buildTextOverlays(
  beat: NarrativeBeat,
  source?: Source,
): TextOverlay[] {
  const overlays: TextOverlay[] = [];

  // Headline: beat headline (from narrative planning) > commercial role headline.
  // Avoids falling back to source.title which is often a technical PDF section title.
  const headline = beat.suggestedHeadline ?? COMMERCIAL_HEADLINES[beat.role];
  if (headline && headline.length > 2) {
    overlays.push({
      text: headline,
      role: beat.role === BeatRole.CTA ? 'cta' : 'headline',
      position: beat.role === BeatRole.CTA ? 'center' : 'top',
      size: beat.role === BeatRole.HOOK ? 'large' : 'medium',
    });
  }

  // Body: use the commercial briefing template text (not raw PDF source text).
  // The briefing template contains production-oriented copy like "Mostrar o melhor
  // do empreendimento — fachada, áreas comuns" which is much better for overlays
  // than raw PDF text from source.summary/source.text.
  if (beat.role !== BeatRole.HOOK && beat.role !== BeatRole.CTA) {
    const bodyCopy = extractBriefingCopy(beat.briefing);
    if (bodyCopy && bodyCopy.length > 10) {
      overlays.push({
        text: bodyCopy.length > 120 ? bodyCopy.slice(0, 117) + '...' : bodyCopy,
        role: 'body',
        position: 'bottom',
        size: 'small',
      });
    }
  }

  // CTA specific: ensure headline + contact subtitle
  if (beat.role === BeatRole.CTA) {
    if (!headline) {
      overlays.push({
        text: 'Agende Sua Visita',
        role: 'cta',
        position: 'center',
        size: 'large',
      });
    }
    // Add WhatsApp/contact subtitle for CTA scenes
    overlays.push({
      text: 'Fale com o corretor pelo WhatsApp',
      role: 'body',
      position: 'bottom',
      size: 'small',
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
