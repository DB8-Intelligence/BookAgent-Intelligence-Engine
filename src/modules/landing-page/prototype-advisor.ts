/**
 * Prototype Advisor for Landing Page
 *
 * Usa o BookPrototype para orientar a composição da landing page:
 *
 * 1. Ordena seções com base na sequência de arquétipos do book
 * 2. Sugere background types baseados no design mode do book
 * 3. Ajusta quantidade de content points por seção (design hierarchy)
 * 4. Infere estilo de headline baseado no headlineStyle do book
 *
 * NUNCA modifica assets originais — apenas influencia composição estrutural.
 */

import type { BookPrototype } from '../../domain/entities/book-prototype.js';
import { PageArchetypeType } from '../../domain/entities/book-prototype.js';
import { LPSectionType } from '../../domain/entities/landing-page-plan.js';

// ---------------------------------------------------------------------------
// Archetype → LP Section mapping
// ---------------------------------------------------------------------------

/**
 * Mapeia PageArchetypeType do book para LPSectionType da landing page.
 * Usado para ordenar seções da LP conforme a progressão editorial do book.
 */
const ARCHETYPE_TO_LP: Partial<Record<PageArchetypeType, LPSectionType>> = {
  [PageArchetypeType.HERO]: LPSectionType.HERO,
  [PageArchetypeType.LIFESTYLE]: LPSectionType.LIFESTYLE,
  [PageArchetypeType.TECHNICAL]: LPSectionType.FLOOR_PLANS,
  [PageArchetypeType.COMPARISON]: LPSectionType.DIFFERENTIALS,
  [PageArchetypeType.LOCATION]: LPSectionType.LOCATION,
  [PageArchetypeType.MASTERPLAN]: LPSectionType.GALLERY,
  [PageArchetypeType.INSTITUTIONAL]: LPSectionType.SOCIAL_PROOF,
  [PageArchetypeType.CTA]: LPSectionType.CTA_FORM,
  [PageArchetypeType.GALLERY]: LPSectionType.GALLERY,
  [PageArchetypeType.INVESTMENT]: LPSectionType.INVESTMENT,
};

// ---------------------------------------------------------------------------
// Section ordering advice
// ---------------------------------------------------------------------------

export interface SectionOrderAdvice {
  /** Ordem preferida de seções baseada no fluxo editorial do book */
  preferredOrder: LPSectionType[];
  /** Se o book tem narrativa progressiva (AIDA natural) */
  hasNaturalAIDA: boolean;
}

/**
 * Gera conselho de ordenação de seções baseado no BookPrototype.
 * O book original define uma progressão narrativa implícita —
 * a LP deve seguir essa mesma lógica.
 */
export function adviseSectionOrder(prototype: BookPrototype): SectionOrderAdvice {
  // Extrair sequência de arquétipos do book (sem duplicatas consecutivas)
  const archetypeSequence: PageArchetypeType[] = [];
  let lastType: PageArchetypeType | null = null;

  for (const arch of prototype.pageArchetypes) {
    if (arch.archetypeType !== lastType && arch.archetypeType !== PageArchetypeType.TRANSITION) {
      archetypeSequence.push(arch.archetypeType);
      lastType = arch.archetypeType;
    }
  }

  // Converter para LP section order
  const preferredOrder: LPSectionType[] = [];
  const seen = new Set<LPSectionType>();

  for (const archetype of archetypeSequence) {
    const lpSection = ARCHETYPE_TO_LP[archetype];
    if (lpSection && !seen.has(lpSection)) {
      preferredOrder.push(lpSection);
      seen.add(lpSection);
    }
  }

  // Garantir que seções essenciais estejam presentes
  if (!seen.has(LPSectionType.HERO)) preferredOrder.unshift(LPSectionType.HERO);
  if (!seen.has(LPSectionType.CTA_FORM)) preferredOrder.push(LPSectionType.CTA_FORM);
  if (!seen.has(LPSectionType.FOOTER)) preferredOrder.push(LPSectionType.FOOTER);

  return {
    preferredOrder,
    hasNaturalAIDA: prototype.designHierarchy.hasNarrativeFlow,
  };
}

// ---------------------------------------------------------------------------
// Background type advice
// ---------------------------------------------------------------------------

export interface BackgroundAdvice {
  /** Se hero deve usar imagem (image-first) ou gradiente */
  heroBackground: 'image' | 'gradient';
  /** Se o book usa muito whitespace (backgrounds clean) */
  preferCleanBackgrounds: boolean;
  /** Proporção de seções com imagem como fundo (0-1) */
  imageBackgroundRatio: number;
}

/**
 * Aconselha estilo de background baseado no design mode do book.
 */
export function adviseBackgrounds(prototype: BookPrototype): BackgroundAdvice {
  const { dominantMode, usesWhitespace } = prototype.designHierarchy;

  // Books image-first → hero com imagem, mais seções com imagem
  if (dominantMode === 'image-first') {
    return {
      heroBackground: 'image',
      preferCleanBackgrounds: false,
      imageBackgroundRatio: 0.6,
    };
  }

  // Books text-first → hero com gradiente, backgrounds clean
  if (dominantMode === 'text-first') {
    return {
      heroBackground: 'gradient',
      preferCleanBackgrounds: true,
      imageBackgroundRatio: 0.2,
    };
  }

  // Balanced → mistura
  return {
    heroBackground: 'image',
    preferCleanBackgrounds: usesWhitespace,
    imageBackgroundRatio: 0.4,
  };
}

// ---------------------------------------------------------------------------
// Headline style advice
// ---------------------------------------------------------------------------

export interface HeadlineAdvice {
  /** Comprimento máximo recomendado para headlines */
  maxHeadlineLength: number;
  /** Se deve usar headlines curtas e de impacto */
  preferShortImpact: boolean;
}

/**
 * Aconselha estilo de headline baseado no headlineStyle do book.
 */
export function adviseHeadlineStyle(prototype: BookPrototype): HeadlineAdvice {
  const { headlineStyle } = prototype.designHierarchy;

  if (headlineStyle === 'short-impact') {
    return { maxHeadlineLength: 30, preferShortImpact: true };
  }

  if (headlineStyle === 'descriptive') {
    return { maxHeadlineLength: 70, preferShortImpact: false };
  }

  return { maxHeadlineLength: 50, preferShortImpact: false };
}

// ---------------------------------------------------------------------------
// Combined advice
// ---------------------------------------------------------------------------

export interface PrototypeAdvice {
  sectionOrder: SectionOrderAdvice;
  backgrounds: BackgroundAdvice;
  headlines: HeadlineAdvice;
  /** Design mode do book (repassado para conveniência) */
  designMode: 'image-first' | 'text-first' | 'balanced';
  /** Consistency score do book (quanto mais alto, mais confiante o advice) */
  confidence: number;
}

/**
 * Gera advice completo do BookPrototype para composição de LP.
 */
export function getPrototypeAdvice(prototype: BookPrototype): PrototypeAdvice {
  return {
    sectionOrder: adviseSectionOrder(prototype),
    backgrounds: adviseBackgrounds(prototype),
    headlines: adviseHeadlineStyle(prototype),
    designMode: prototype.designHierarchy.dominantMode,
    confidence: prototype.consistencyScore,
  };
}
