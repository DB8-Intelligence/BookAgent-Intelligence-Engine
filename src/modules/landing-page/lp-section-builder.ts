/**
 * LP Section Builder
 *
 * Converte NarrativeBeats em LandingPageSections — seções de
 * conversão ordenadas segundo o modelo AIDA.
 *
 * Diferenças em relação ao blog:
 * - Cada seção tem um papel de conversão explícito (AIDA)
 * - Headlines são mais curtas e impactantes
 * - Subheadings focam em benefício, não em descrição
 * - Content points são bullets de venda
 * - Background type alterna entre image e color
 * - CTAs inline aparecem entre seções
 */

import { v4 as uuid } from 'uuid';
import type { NarrativeBeat } from '../../domain/entities/narrative.js';
import { BeatRole } from '../../domain/entities/narrative.js';
import type { Source } from '../../domain/entities/source.js';
import type { BrandingProfile } from '../../domain/entities/branding.js';
import type { BookPrototype } from '../../domain/entities/book-prototype.js';
import type { LandingPageSection } from '../../domain/entities/landing-page-plan.js';
import { LPSectionType, ConversionRole } from '../../domain/entities/landing-page-plan.js';
import { getPrototypeAdvice, type PrototypeAdvice } from './prototype-advisor.js';

// ---------------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------------

interface SectionMapping {
  sectionType: LPSectionType;
  conversionRole: ConversionRole;
  defaultHeading: string;
  defaultSubheading: string;
  backgroundType: 'image' | 'color' | 'gradient';
}

const BEAT_TO_LP_SECTION: Record<BeatRole, SectionMapping> = {
  [BeatRole.HOOK]: {
    sectionType: LPSectionType.HERO,
    conversionRole: ConversionRole.ATTENTION,
    defaultHeading: 'Seu Novo Endereço Começa Aqui',
    defaultSubheading: 'Descubra o empreendimento que vai transformar seu conceito de morar bem',
    backgroundType: 'image',
  },
  [BeatRole.CONTEXT]: {
    sectionType: LPSectionType.ABOUT,
    conversionRole: ConversionRole.INTEREST,
    defaultHeading: 'O Empreendimento',
    defaultSubheading: 'Conceito, localização e proposta de valor',
    backgroundType: 'color',
  },
  [BeatRole.SHOWCASE]: {
    sectionType: LPSectionType.GALLERY,
    conversionRole: ConversionRole.DESIRE,
    defaultHeading: 'Conheça os Ambientes',
    defaultSubheading: 'Cada detalhe pensado para o seu conforto',
    backgroundType: 'color',
  },
  [BeatRole.DIFFERENTIATOR]: {
    sectionType: LPSectionType.DIFFERENTIALS,
    conversionRole: ConversionRole.INTEREST,
    defaultHeading: 'Diferenciais Exclusivos',
    defaultSubheading: 'O que torna este empreendimento único',
    backgroundType: 'gradient',
  },
  [BeatRole.LIFESTYLE]: {
    sectionType: LPSectionType.LIFESTYLE,
    conversionRole: ConversionRole.DESIRE,
    defaultHeading: 'Lazer Completo',
    defaultSubheading: 'Tudo que sua família precisa, a poucos passos de casa',
    backgroundType: 'image',
  },
  [BeatRole.INVESTMENT]: {
    sectionType: LPSectionType.INVESTMENT,
    conversionRole: ConversionRole.DESIRE,
    defaultHeading: 'Investimento Inteligente',
    defaultSubheading: 'Condições especiais para você sair na frente',
    backgroundType: 'color',
  },
  [BeatRole.SOCIAL_PROOF]: {
    sectionType: LPSectionType.SOCIAL_PROOF,
    conversionRole: ConversionRole.TRUST,
    defaultHeading: 'Quem Está Por Trás',
    defaultSubheading: 'Tradição e solidez que você pode confiar',
    backgroundType: 'color',
  },
  [BeatRole.REINFORCEMENT]: {
    sectionType: LPSectionType.GALLERY,
    conversionRole: ConversionRole.DESIRE,
    defaultHeading: 'Mais Para Você',
    defaultSubheading: 'Detalhes que fazem toda a diferença',
    backgroundType: 'image',
  },
  [BeatRole.CLOSING]: {
    sectionType: LPSectionType.CTA_INLINE,
    conversionRole: ConversionRole.ACTION,
    defaultHeading: 'Não Perca Esta Oportunidade',
    defaultSubheading: 'Garanta sua unidade antes que acabe',
    backgroundType: 'gradient',
  },
  [BeatRole.CTA]: {
    sectionType: LPSectionType.CTA_FORM,
    conversionRole: ConversionRole.ACTION,
    defaultHeading: 'Fale Com Um Consultor',
    defaultSubheading: 'Preencha o formulário e receba informações exclusivas',
    backgroundType: 'color',
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converte NarrativeBeats em LandingPageSections.
 *
 * Quando bookPrototype está disponível, refina a composição:
 * - Background types seguem o design mode do book
 * - Seções são reordenadas conforme a progressão editorial do book
 * - Headlines respeitam o estilo (curto-impacto vs descritivo)
 */
export function buildLPSections(
  beats: NarrativeBeat[],
  sources: Source[],
  branding?: BrandingProfile,
  bookPrototype?: BookPrototype,
): LandingPageSection[] {
  const sourceMap = new Map(sources.map((s) => [s.id, s]));
  const bgColor = branding?.colors?.background ?? '#ffffff';
  const accentColor = branding?.colors?.accent ?? '#0066cc';

  // Obter advice do BookPrototype (se disponível)
  const advice = bookPrototype ? getPrototypeAdvice(bookPrototype) : undefined;

  const sections: LandingPageSection[] = [];
  const usedTypes = new Set<LPSectionType>();

  for (const beat of beats) {
    const mapping = BEAT_TO_LP_SECTION[beat.role];
    if (!mapping) continue;

    // Permitir duplicatas apenas para GALLERY e CTA_INLINE
    if (
      usedTypes.has(mapping.sectionType) &&
      mapping.sectionType !== LPSectionType.GALLERY &&
      mapping.sectionType !== LPSectionType.CTA_INLINE
    ) {
      continue;
    }
    usedTypes.add(mapping.sectionType);

    const source = beat.sourceId ? sourceMap.get(beat.sourceId) : undefined;

    // Refinar background type com base no book prototype
    const refinedMapping = advice
      ? refineMapping(mapping, advice, sections.length === 0)
      : mapping;

    sections.push(buildSection(
      sections.length,
      refinedMapping,
      beat,
      source,
      bgColor,
      accentColor,
      advice,
    ));
  }

  // Reordenar seções se o book prototype sugere uma progressão diferente
  const orderedSections = advice
    ? reorderByPrototype(sections, advice)
    : sections;

  // Garantir footer no final
  if (!usedTypes.has(LPSectionType.FOOTER)) {
    orderedSections.push({
      id: uuid(),
      order: orderedSections.length,
      sectionType: LPSectionType.FOOTER,
      conversionRole: ConversionRole.ACTION,
      heading: 'Contato',
      subheading: 'Estamos prontos para atender você',
      sourceIds: [],
      assetIds: [],
      summary: 'Rodapé com informações de contato, mapa e dados legais.',
      contentPoints: [
        'Endereço do plantão de vendas',
        'Telefone e WhatsApp',
        'Horário de atendimento',
        'CRECI e registro da incorporação',
      ],
      ctaText: 'Fale conosco pelo WhatsApp',
      backgroundType: 'color',
      backgroundColor: '#1a1a1a',
    });
  }

  // Recalcular order indexes
  for (let i = 0; i < orderedSections.length; i++) {
    orderedSections[i] = { ...orderedSections[i], order: i };
  }

  return orderedSections;
}

/**
 * Refina o backgroundType do mapping com base no advice do BookPrototype.
 */
function refineMapping(
  mapping: SectionMapping,
  advice: PrototypeAdvice,
  isHero: boolean,
): SectionMapping {
  if (isHero) {
    return { ...mapping, backgroundType: advice.backgrounds.heroBackground };
  }

  // Books image-first → mais seções com imagem
  if (advice.backgrounds.imageBackgroundRatio > 0.5 && mapping.backgroundType === 'color') {
    // Converter algumas seções 'color' para 'image' em books visuais
    if (mapping.sectionType === LPSectionType.LIFESTYLE ||
        mapping.sectionType === LPSectionType.GALLERY) {
      return { ...mapping, backgroundType: 'image' };
    }
  }

  // Books com whitespace → preferir backgrounds clean
  if (advice.backgrounds.preferCleanBackgrounds && mapping.backgroundType === 'gradient') {
    return { ...mapping, backgroundType: 'color' };
  }

  return mapping;
}

/**
 * Reordena seções da LP conforme a progressão editorial do book.
 * Hero e Footer mantêm posição fixa. Seções intermediárias são
 * reordenadas para seguir o fluxo do book original.
 */
function reorderByPrototype(
  sections: LandingPageSection[],
  advice: PrototypeAdvice,
): LandingPageSection[] {
  if (!advice.sectionOrder.hasNaturalAIDA || sections.length < 3) {
    return sections;
  }

  const preferred = advice.sectionOrder.preferredOrder;

  // Separar hero (primeiro), footer (último) e intermediárias
  const hero = sections.find(s => s.sectionType === LPSectionType.HERO);
  const footer = sections.find(s => s.sectionType === LPSectionType.FOOTER);
  const middle = sections.filter(
    s => s.sectionType !== LPSectionType.HERO && s.sectionType !== LPSectionType.FOOTER,
  );

  // Reordenar intermediárias conforme preferência do book
  const sorted = middle.sort((a, b) => {
    const idxA = preferred.indexOf(a.sectionType);
    const idxB = preferred.indexOf(b.sectionType);
    // Seções não encontradas no book vão para o final
    const posA = idxA >= 0 ? idxA : 999;
    const posB = idxB >= 0 ? idxB : 999;
    return posA - posB;
  });

  const result: LandingPageSection[] = [];
  if (hero) result.push(hero);
  result.push(...sorted);
  if (footer) result.push(footer);

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSection(
  order: number,
  mapping: SectionMapping,
  beat: NarrativeBeat,
  source: Source | undefined,
  bgColor: string,
  accentColor: string,
  advice?: PrototypeAdvice,
): LandingPageSection {
  const maxHeadlineLen = advice?.headlines.maxHeadlineLength ?? 50;
  const heading = generateLPHeading(mapping, beat, source, maxHeadlineLen);
  const subheading = generateSubheading(mapping, source);
  const contentPoints = extractContentPoints(source);
  const assetIds = source ? source.assetIds.slice(0, 4) : beat.suggestedAssetIds.slice(0, 4);

  // Alternar background para ritmo visual
  const backgroundColor = mapping.backgroundType === 'gradient'
    ? accentColor
    : order % 2 === 0 ? bgColor : darkenColor(bgColor);

  return {
    id: uuid(),
    order,
    sectionType: mapping.sectionType,
    conversionRole: mapping.conversionRole,
    heading,
    subheading,
    sourceIds: source ? [source.id] : [],
    assetIds,
    summary: source?.summary ?? mapping.defaultSubheading,
    contentPoints,
    ctaText: mapping.conversionRole === ConversionRole.ACTION
      ? 'Quero Saber Mais'
      : undefined,
    backgroundType: mapping.backgroundType,
    backgroundColor,
  };
}

function generateLPHeading(
  mapping: SectionMapping,
  beat: NarrativeBeat,
  source?: Source,
  maxLength = 50,
): string {
  // Para hero, usar headline curta e impactante
  if (mapping.sectionType === LPSectionType.HERO) {
    if (source?.title && source.title.length > 5 && source.title.length < maxLength) {
      return source.title;
    }
    return mapping.defaultHeading;
  }

  // Para outras seções, tentar headline da source se dentro do limite
  if (beat.suggestedHeadline && beat.suggestedHeadline.length < maxLength) {
    return beat.suggestedHeadline;
  }

  if (source?.title && source.title.length < maxLength) {
    return source.title;
  }

  return mapping.defaultHeading;
}

function generateSubheading(mapping: SectionMapping, source?: Source): string {
  if (source?.summary && source.summary.length > 20 && source.summary.length < 120) {
    return source.summary;
  }
  return mapping.defaultSubheading;
}

function extractContentPoints(source?: Source): string[] {
  if (!source) return [];

  const points: string[] = [];

  // Extrair frases curtas do texto (estilo bullets de venda)
  const sentences = source.text
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10 && s.length < 100);

  for (const sentence of sentences.slice(0, 6)) {
    points.push(sentence);
  }

  return points;
}

/**
 * Escurece levemente uma cor hex para alternância de background.
 */
function darkenColor(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#f0f0f0';

  const r = Math.max(0, parseInt(clean.slice(0, 2), 16) - 10);
  const g = Math.max(0, parseInt(clean.slice(2, 4), 16) - 10);
  const b = Math.max(0, parseInt(clean.slice(4, 6), 16) - 10);

  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}
