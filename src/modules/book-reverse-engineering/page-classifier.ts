/**
 * Page Classifier
 *
 * Classifica cada página do book em um PageArchetypeType com base em:
 * - Conteúdo textual (palavras-chave, padrões)
 * - Proporção texto/imagem
 * - Presença de assets
 * - Posição no documento (primeira/última páginas)
 *
 * A classificação é local (V1) — baseada em heurísticas de texto.
 * Em V2, pode ser enriquecida com visão computacional via IAIAdapter.
 */

import type { Asset } from '../../domain/entities/asset.js';
import {
  PageArchetypeType,
  ContentZoneType,
  ZonePosition,
  CompositionPattern,
  type ContentZone,
  type PageArchetype,
} from '../../domain/entities/book-prototype.js';

// ---------------------------------------------------------------------------
// Keyword maps for classification
// ---------------------------------------------------------------------------

const KEYWORD_MAP: Record<PageArchetypeType, RegExp[]> = {
  [PageArchetypeType.HERO]: [
    /bem[- ]?vindo/i, /welcome/i, /apresenta/i, /conheça/i,
    /lançamento/i, /novo\s+endereço/i,
  ],
  [PageArchetypeType.LIFESTYLE]: [
    /lazer/i, /piscina/i, /churrasqueir/i, /playground/i,
    /fitness/i, /academia/i, /salão\s+de\s+festas/i, /spa/i,
    /espaço\s+gourmet/i, /rooftop/i, /lounge/i, /sauna/i,
    /brinquedoteca/i, /pet/i, /coworking/i,
  ],
  [PageArchetypeType.TECHNICAL]: [
    /planta/i, /m²/i, /metragem/i, /dormitório/i, /suíte/i,
    /vaga/i, /garagem/i, /apartamento\s+tipo/i, /torre/i,
    /pavimento/i, /andar/i, /cobertura/i, /garden/i,
    /\d+\s*m²/i, /área\s+(útil|privativa|total)/i,
  ],
  [PageArchetypeType.COMPARISON]: [
    /compara/i, /diferencia/i, /benchmark/i, /versus/i,
    /tabela/i, /vantage/i,
  ],
  [PageArchetypeType.LOCATION]: [
    /localização/i, /mapa/i, /entorno/i, /acesso/i,
    /bairro/i, /região/i, /endereço/i, /próximo\s+a/i,
    /distância/i, /metrô/i, /avenida/i, /rua\s/i,
  ],
  [PageArchetypeType.MASTERPLAN]: [
    /implantação/i, /masterplan/i, /empreendimento/i,
    /condomínio/i, /projeto/i, /fachada/i,
  ],
  [PageArchetypeType.INSTITUTIONAL]: [
    /construtora/i, /incorporadora/i, /história/i,
    /tradição/i, /experiência/i, /anos\s+de/i,
    /certificação/i, /prêmio/i, /entregue/i,
  ],
  [PageArchetypeType.CTA]: [
    /visite/i, /agende/i, /ligue/i, /whatsapp/i,
    /plantão/i, /contato/i, /telefone/i, /email/i,
    /cadastre/i, /registre/i, /fale\s+conosco/i,
    /reserve/i, /garanta/i,
  ],
  [PageArchetypeType.GALLERY]: [
    /galeria/i, /fotos/i, /imagens/i, /perspectiva/i,
  ],
  [PageArchetypeType.INVESTMENT]: [
    /investimento/i, /valor/i, /financiamento/i, /parcela/i,
    /entrada/i, /preço/i, /condições/i, /tabela\s+de\s+preço/i,
    /r\$\s*\d/i, /pagamento/i,
  ],
  [PageArchetypeType.TRANSITION]: [],
  [PageArchetypeType.UNKNOWN]: [],
};

// ---------------------------------------------------------------------------
// Classification logic
// ---------------------------------------------------------------------------

interface PageInput {
  pageNumber: number;
  text: string;
  assets: Asset[];
  totalPages: number;
}

/**
 * Calcula scores de match para cada tipo de arquétipo.
 */
function scoreArchetypes(text: string): Map<PageArchetypeType, number> {
  const scores = new Map<PageArchetypeType, number>();

  for (const [archetype, patterns] of Object.entries(KEYWORD_MAP)) {
    let score = 0;
    for (const pattern of patterns) {
      const matches = text.match(new RegExp(pattern, 'gi'));
      if (matches) {
        score += matches.length;
      }
    }
    scores.set(archetype as PageArchetypeType, score);
  }

  return scores;
}

/**
 * Detecta se a página é provavelmente uma transição
 * (muito pouco texto, geralmente decorativa).
 */
function isTransitionPage(text: string, hasAssets: boolean): boolean {
  const trimmed = text.trim();
  // Páginas com < 20 chars e sem keywords significativos
  return trimmed.length < 20 && !hasAssets;
}

/**
 * Estima a proporção texto/imagem de uma página.
 * 0 = só imagem, 1 = só texto
 */
function estimateTextImageRatio(text: string, assetCount: number): number {
  const textLength = text.trim().length;

  if (textLength === 0 && assetCount === 0) return 0.5;
  if (textLength === 0) return 0;
  if (assetCount === 0) return 1;

  // Heurística: texto longo + poucas imagens = mais texto
  const textWeight = Math.min(textLength / 500, 1);
  const imageWeight = Math.min(assetCount / 3, 1);

  return textWeight / (textWeight + imageWeight);
}

/**
 * Infere ContentZones básicas a partir do texto e assets.
 */
function inferContentZones(
  text: string,
  assets: Asset[],
  archetype: PageArchetypeType,
): ContentZone[] {
  const zones: ContentZone[] = [];
  const lines = text.split('\n').filter(l => l.trim().length > 0);

  // Detectar headline (primeira linha curta e "forte")
  if (lines.length > 0 && lines[0].length < 80) {
    zones.push({
      type: ContentZoneType.HEADLINE,
      position: ZonePosition.TOP_CENTER,
      areaRatio: 0.1,
      hasAsset: false,
      hasText: true,
      contentPreview: lines[0].substring(0, 50),
    });
  }

  // Detectar body text
  const bodyLines = lines.filter(l => l.length > 40);
  if (bodyLines.length > 0) {
    zones.push({
      type: ContentZoneType.BODY_TEXT,
      position: ZonePosition.MIDDLE_CENTER,
      areaRatio: Math.min(bodyLines.length * 0.05, 0.4),
      hasAsset: false,
      hasText: true,
      contentPreview: bodyLines[0].substring(0, 50),
    });
  }

  // Detectar feature list (linhas com bullets ou padrões de lista)
  const listLines = lines.filter(l => /^[\s]*[•\-\*\d+\.]\s/.test(l));
  if (listLines.length >= 2) {
    zones.push({
      type: ContentZoneType.FEATURE_LIST,
      position: ZonePosition.MIDDLE_LEFT,
      areaRatio: Math.min(listLines.length * 0.04, 0.3),
      hasAsset: false,
      hasText: true,
      contentPreview: listLines[0].substring(0, 50),
    });
  }

  // Detectar imagem principal (se há assets)
  if (assets.length > 0) {
    zones.push({
      type: ContentZoneType.PRIMARY_IMAGE,
      position: archetype === PageArchetypeType.HERO
        ? ZonePosition.FULL_PAGE
        : ZonePosition.TOP_HALF,
      areaRatio: archetype === PageArchetypeType.HERO ? 0.8 : 0.5,
      hasAsset: true,
      hasText: false,
    });
  }

  // Detectar secondary images
  if (assets.length > 1) {
    zones.push({
      type: ContentZoneType.SECONDARY_IMAGE,
      position: ZonePosition.BOTTOM_HALF,
      areaRatio: 0.25,
      hasAsset: true,
      hasText: false,
    });
  }

  // Detectar floor plan em páginas técnicas
  if (archetype === PageArchetypeType.TECHNICAL && assets.length > 0) {
    zones.push({
      type: ContentZoneType.FLOOR_PLAN,
      position: ZonePosition.MIDDLE_CENTER,
      areaRatio: 0.6,
      hasAsset: true,
      hasText: false,
    });
  }

  // Detectar mapa em páginas de localização
  if (archetype === PageArchetypeType.LOCATION) {
    zones.push({
      type: ContentZoneType.MAP,
      position: ZonePosition.MIDDLE_CENTER,
      areaRatio: 0.5,
      hasAsset: assets.length > 0,
      hasText: false,
    });
  }

  // Detectar CTA block
  if (archetype === PageArchetypeType.CTA) {
    zones.push({
      type: ContentZoneType.CTA_BLOCK,
      position: ZonePosition.BOTTOM_CENTER,
      areaRatio: 0.2,
      hasAsset: false,
      hasText: true,
    });
  }

  // Detectar numeric highlights (números grandes no texto)
  const numericMatches = text.match(/\d{2,}[\s]*m²|\d+\s*(torres?|andares?|unidades?)/gi);
  if (numericMatches && numericMatches.length > 0) {
    zones.push({
      type: ContentZoneType.NUMERIC_HIGHLIGHT,
      position: ZonePosition.MIDDLE_CENTER,
      areaRatio: 0.1,
      hasAsset: false,
      hasText: true,
      contentPreview: numericMatches[0].substring(0, 50),
    });
  }

  return zones;
}

/**
 * Infere o CompositionPattern a partir do archetype e zones.
 */
function inferCompositionPattern(
  archetype: PageArchetypeType,
  zones: ContentZone[],
  textImageRatio: number,
): CompositionPattern {
  const hasFullPageImage = zones.some(
    z => z.type === ContentZoneType.PRIMARY_IMAGE && z.position === ZonePosition.FULL_PAGE,
  );
  const hasText = zones.some(z => z.hasText);
  const imageCount = zones.filter(z => z.hasAsset).length;

  if (hasFullPageImage && hasText) return CompositionPattern.FULL_BLEED_OVERLAY;
  if (hasFullPageImage && !hasText) return CompositionPattern.MINIMAL;
  if (imageCount >= 3) return CompositionPattern.GRID;
  if (textImageRatio > 0.8) return CompositionPattern.SINGLE_COLUMN;
  if (textImageRatio < 0.2 && imageCount > 0) return CompositionPattern.MINIMAL;

  // Split patterns based on archetype
  if (archetype === PageArchetypeType.TECHNICAL) return CompositionPattern.SPLIT_VERTICAL;
  if (archetype === PageArchetypeType.COMPARISON) return CompositionPattern.TWO_COLUMN;
  if (archetype === PageArchetypeType.CTA) return CompositionPattern.TEXT_CENTERED;

  // Default: split horizontal if both text and image
  if (imageCount > 0 && hasText) return CompositionPattern.SPLIT_HORIZONTAL;

  return CompositionPattern.SINGLE_COLUMN;
}

/**
 * Classifica uma única página do book.
 */
export function classifyPage(input: PageInput): PageArchetype {
  const { pageNumber, text, assets, totalPages } = input;
  const pageAssets = assets.filter(a => a.page === pageNumber);
  const hasAssets = pageAssets.length > 0;

  // Transition page check
  if (isTransitionPage(text, hasAssets)) {
    const zones: ContentZone[] = text.trim().length > 0
      ? [{
          type: ContentZoneType.HEADLINE,
          position: ZonePosition.MIDDLE_CENTER,
          areaRatio: 0.1,
          hasAsset: false,
          hasText: true,
          contentPreview: text.trim().substring(0, 50),
        }]
      : [];

    return {
      pageNumber,
      archetypeType: PageArchetypeType.TRANSITION,
      confidence: 0.7,
      compositionPattern: CompositionPattern.MINIMAL,
      contentZones: zones,
      assetIds: pageAssets.map(a => a.id),
      textImageRatio: 1,
      hasFullBleedImage: false,
      visualHierarchy: zones.map(z => z.type),
    };
  }

  // Score-based classification
  const scores = scoreArchetypes(text);

  // Position-based boosts
  if (pageNumber === 1) {
    scores.set(PageArchetypeType.HERO, (scores.get(PageArchetypeType.HERO) ?? 0) + 3);
  }
  if (pageNumber === totalPages) {
    scores.set(PageArchetypeType.CTA, (scores.get(PageArchetypeType.CTA) ?? 0) + 2);
  }

  // Asset count boosts
  if (pageAssets.length >= 3) {
    scores.set(PageArchetypeType.GALLERY, (scores.get(PageArchetypeType.GALLERY) ?? 0) + 2);
  }

  // Find winner
  let bestType = PageArchetypeType.UNKNOWN;
  let bestScore = 0;
  let totalScore = 0;

  for (const [type, score] of scores) {
    totalScore += score;
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  // Confidence based on score dominance
  const confidence = totalScore > 0
    ? Math.min(0.5 + (bestScore / totalScore) * 0.5, 0.95)
    : 0.3;

  const textImageRatio = estimateTextImageRatio(text, pageAssets.length);
  const contentZones = inferContentZones(text, pageAssets, bestType);
  const compositionPattern = inferCompositionPattern(bestType, contentZones, textImageRatio);

  const hasFullBleedImage = contentZones.some(
    z => z.type === ContentZoneType.PRIMARY_IMAGE && z.position === ZonePosition.FULL_PAGE,
  );

  // Visual hierarchy: sort zones by area ratio (descending)
  const visualHierarchy = [...contentZones]
    .sort((a, b) => b.areaRatio - a.areaRatio)
    .map(z => z.type);

  return {
    pageNumber,
    archetypeType: bestType,
    confidence,
    compositionPattern,
    contentZones,
    assetIds: pageAssets.map(a => a.id),
    textImageRatio,
    hasFullBleedImage,
    visualHierarchy,
  };
}

/**
 * Classifica todas as páginas do book.
 */
export function classifyAllPages(
  pageTexts: Array<{ pageNumber: number; text: string }>,
  assets: Asset[],
): PageArchetype[] {
  const totalPages = pageTexts.length;

  return pageTexts.map(({ pageNumber, text }) =>
    classifyPage({ pageNumber, text, assets, totalPages }),
  );
}
