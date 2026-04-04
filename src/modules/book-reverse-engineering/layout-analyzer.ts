/**
 * Layout Analyzer
 *
 * Analisa os PageArchetypes classificados e identifica:
 * - Padrões de layout recorrentes (LayoutPattern)
 * - Hierarquia de design do book (DesignHierarchy)
 * - Score de consistência visual
 *
 * Trabalha sobre os resultados do page-classifier,
 * sem acessar ou modificar os assets originais.
 */

import {
  PageArchetypeType,
  ContentZoneType,
  CompositionPattern,
  type PageArchetype,
  type LayoutPattern,
  type DesignHierarchy,
  type BookPrototype,
} from '../../domain/entities/book-prototype.js';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Layout Pattern Detection
// ---------------------------------------------------------------------------

/** Nomes descritivos para composições */
const COMPOSITION_NAMES: Record<CompositionPattern, string> = {
  [CompositionPattern.FULL_BLEED_OVERLAY]: 'Full-Bleed com Overlay de Texto',
  [CompositionPattern.SPLIT_HORIZONTAL]: 'Split Horizontal (Imagem + Texto)',
  [CompositionPattern.SPLIT_VERTICAL]: 'Split Vertical (Topo + Base)',
  [CompositionPattern.GRID]: 'Grid de Múltiplas Imagens',
  [CompositionPattern.TEXT_CENTERED]: 'Texto Centralizado',
  [CompositionPattern.SINGLE_COLUMN]: 'Coluna Única Editorial',
  [CompositionPattern.TWO_COLUMN]: 'Duas Colunas',
  [CompositionPattern.CARD_BLOCK]: 'Card / Bloco Destacado',
  [CompositionPattern.INSET]: 'Imagem Inset sobre Fundo',
  [CompositionPattern.MINIMAL]: 'Minimal / Clean',
};

/**
 * Agrupa páginas por CompositionPattern e gera LayoutPatterns.
 */
export function detectLayoutPatterns(archetypes: PageArchetype[]): LayoutPattern[] {
  // Agrupar por composição
  const groups = new Map<CompositionPattern, PageArchetype[]>();

  for (const arch of archetypes) {
    const existing = groups.get(arch.compositionPattern) ?? [];
    existing.push(arch);
    groups.set(arch.compositionPattern, existing);
  }

  const patterns: LayoutPattern[] = [];

  for (const [composition, pages] of groups) {
    // Coletar tipos de zona mais comuns
    const zoneCounts = new Map<ContentZoneType, number>();
    const archetypeCounts = new Map<PageArchetypeType, number>();

    for (const page of pages) {
      for (const zone of page.contentZones) {
        zoneCounts.set(zone.type, (zoneCounts.get(zone.type) ?? 0) + 1);
      }
      archetypeCounts.set(
        page.archetypeType,
        (archetypeCounts.get(page.archetypeType) ?? 0) + 1,
      );
    }

    // Zonas presentes em > 50% das páginas deste grupo
    const threshold = pages.length * 0.5;
    const typicalZones = Array.from(zoneCounts.entries())
      .filter(([, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([type]) => type);

    // Arquétipos típicos (todos que aparecem)
    const typicalArchetypes = Array.from(archetypeCounts.keys());

    patterns.push({
      id: randomUUID(),
      name: COMPOSITION_NAMES[composition] ?? composition,
      compositionPattern: composition,
      typicalZones,
      frequency: pages.length,
      pageNumbers: pages.map(p => p.pageNumber).sort((a, b) => a - b),
      typicalArchetypes,
    });
  }

  // Ordenar por frequência (mais usado primeiro)
  return patterns.sort((a, b) => b.frequency - a.frequency);
}

// ---------------------------------------------------------------------------
// Design Hierarchy Detection
// ---------------------------------------------------------------------------

/**
 * Analisa a hierarquia de design do book inteiro.
 */
export function analyzeDesignHierarchy(archetypes: PageArchetype[]): DesignHierarchy {
  if (archetypes.length === 0) {
    return {
      primaryElements: [],
      dominantMode: 'balanced',
      headlineStyle: 'mixed',
      usesWhitespace: false,
      hasNarrativeFlow: false,
    };
  }

  // 1. Primary elements — zonas mais frequentes no book todo
  const globalZoneCounts = new Map<ContentZoneType, number>();
  for (const arch of archetypes) {
    for (const zone of arch.contentZones) {
      globalZoneCounts.set(zone.type, (globalZoneCounts.get(zone.type) ?? 0) + 1);
    }
  }
  const primaryElements = Array.from(globalZoneCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type]) => type);

  // 2. Dominant mode — média de textImageRatio
  const avgRatio = archetypes.reduce((sum, a) => sum + a.textImageRatio, 0) / archetypes.length;
  const dominantMode: DesignHierarchy['dominantMode'] =
    avgRatio < 0.35 ? 'image-first' :
    avgRatio > 0.65 ? 'text-first' :
    'balanced';

  // 3. Headline style — analisar headlines encontradas
  const headlines = archetypes.flatMap(a =>
    a.contentZones
      .filter(z => z.type === ContentZoneType.HEADLINE && z.contentPreview)
      .map(z => z.contentPreview!),
  );

  let headlineStyle: DesignHierarchy['headlineStyle'] = 'mixed';
  if (headlines.length > 0) {
    const avgLen = headlines.reduce((s, h) => s + h.length, 0) / headlines.length;
    headlineStyle = avgLen < 25 ? 'short-impact' : avgLen > 60 ? 'descriptive' : 'mixed';
  }

  // 4. Uses whitespace — páginas com zona WHITESPACE ou TRANSITION ou MINIMAL
  const whitespacePages = archetypes.filter(a =>
    a.contentZones.some(z => z.type === ContentZoneType.WHITESPACE) ||
    a.archetypeType === PageArchetypeType.TRANSITION ||
    a.compositionPattern === CompositionPattern.MINIMAL,
  );
  const usesWhitespace = whitespacePages.length / archetypes.length > 0.15;

  // 5. Narrative flow — detectar se há progressão lógica de arquétipos
  // Um book com fluxo narrativo tipicamente segue: HERO → LIFESTYLE → TECHNICAL → CTA
  const narrativeSequence = [
    PageArchetypeType.HERO,
    PageArchetypeType.LIFESTYLE,
    PageArchetypeType.TECHNICAL,
    PageArchetypeType.CTA,
  ];

  let lastSeenIndex = -1;
  let progressionCount = 0;
  for (const arch of archetypes) {
    const idx = narrativeSequence.indexOf(arch.archetypeType);
    if (idx >= 0 && idx >= lastSeenIndex) {
      progressionCount++;
      lastSeenIndex = idx;
    }
  }
  const hasNarrativeFlow = progressionCount >= 3;

  return {
    primaryElements,
    dominantMode,
    headlineStyle,
    usesWhitespace,
    hasNarrativeFlow,
  };
}

// ---------------------------------------------------------------------------
// Consistency Score
// ---------------------------------------------------------------------------

/**
 * Calcula um score de consistência visual (0-1).
 * Books consistentes reutilizam os mesmos padrões de layout.
 */
export function calculateConsistencyScore(
  archetypes: PageArchetype[],
  patterns: LayoutPattern[],
): number {
  if (archetypes.length === 0) return 0;

  // Fator 1: concentração de layouts — poucos padrões = mais consistente
  const patternCount = patterns.length;
  const maxPatterns = Math.min(archetypes.length, 10);
  const layoutConcentration = 1 - (patternCount - 1) / maxPatterns;

  // Fator 2: padrão dominante cobre que % das páginas
  const dominantCoverage = patterns.length > 0
    ? patterns[0].frequency / archetypes.length
    : 0;

  // Fator 3: confiança média das classificações
  const avgConfidence = archetypes.reduce((s, a) => s + a.confidence, 0) / archetypes.length;

  // Peso: 40% concentração + 35% cobertura dominante + 25% confiança
  const score = layoutConcentration * 0.4 + dominantCoverage * 0.35 + avgConfidence * 0.25;

  return Math.max(0, Math.min(1, score));
}

// ---------------------------------------------------------------------------
// Archetype Distribution
// ---------------------------------------------------------------------------

/**
 * Calcula a distribuição de tipos de arquétipo no book.
 */
export function calculateArchetypeDistribution(
  archetypes: PageArchetype[],
): Record<string, number> {
  const distribution: Record<string, number> = {};

  for (const arch of archetypes) {
    distribution[arch.archetypeType] = (distribution[arch.archetypeType] ?? 0) + 1;
  }

  return distribution;
}

// ---------------------------------------------------------------------------
// Full Prototype Builder
// ---------------------------------------------------------------------------

/**
 * Constrói o BookPrototype completo a partir dos PageArchetypes.
 */
export function buildBookPrototype(
  archetypes: PageArchetype[],
  analysisTimeMs: number,
): BookPrototype {
  const layoutPatterns = detectLayoutPatterns(archetypes);
  const designHierarchy = analyzeDesignHierarchy(archetypes);
  const consistencyScore = calculateConsistencyScore(archetypes, layoutPatterns);
  const archetypeDistribution = calculateArchetypeDistribution(archetypes);

  return {
    id: randomUUID(),
    pageCount: archetypes.length,
    pageArchetypes: archetypes,
    layoutPatterns,
    designHierarchy,
    archetypeDistribution,
    consistencyScore,
    analysisTimeMs,
  };
}
