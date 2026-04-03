/**
 * Source Ranker
 *
 * Calcula um score de qualidade para cada Source e reordena
 * por prioridade efetiva. O ranking determina quais fontes
 * serão selecionadas primeiro pelos módulos de geração.
 *
 * Critérios de scoring (v1):
 * - Riqueza textual: fontes com mais texto e headline são melhores
 * - Assets visuais: fontes com imagens têm mais valor
 * - Confiança da correlação: alta confiança = melhor ranking
 * - Tipo estratégico: hero, lifestyle, CTA recebem boost
 * - Papel narrativo: hook e closing são mais valiosos
 * - Completude: fontes com texto + imagem + headline são mais completas
 *
 * O score final (0-1) é usado para reordenar e atribuir prioridade.
 */

import type { Source } from '../../domain/entities/source.js';
import { SourceType, NarrativeRole } from '../../domain/value-objects/index.js';

/** Pesos dos critérios de ranking */
const WEIGHTS = {
  textRichness: 0.20,
  visualRichness: 0.20,
  confidence: 0.15,
  typeBoost: 0.15,
  narrativeBoost: 0.10,
  completeness: 0.20,
} as const;

/** Boost de tipo (1.0 = neutro, >1.0 = favorecido) */
const TYPE_BOOST: Partial<Record<SourceType, number>> = {
  [SourceType.HERO]: 1.0,
  [SourceType.LIFESTYLE]: 0.9,
  [SourceType.DIFERENCIAL]: 0.85,
  [SourceType.CTA]: 0.8,
  [SourceType.PLANTA]: 0.75,
  [SourceType.INFRAESTRUTURA]: 0.7,
  [SourceType.INVESTIMENTO]: 0.65,
  [SourceType.INSTITUCIONAL]: 0.5,
  [SourceType.COMPARATIVO]: 0.5,
  [SourceType.EDITORIAL]: 0.4,
};

/** Boost narrativo */
const NARRATIVE_BOOST: Partial<Record<NarrativeRole, number>> = {
  [NarrativeRole.HOOK]: 1.0,
  [NarrativeRole.CLOSING]: 0.9,
  [NarrativeRole.DIFFERENTIATOR]: 0.8,
  [NarrativeRole.SHOWCASE]: 0.7,
  [NarrativeRole.SOCIAL_PROOF]: 0.6,
  [NarrativeRole.CONTEXT]: 0.4,
};

/**
 * Calcula score de qualidade e reordena as sources por ranking.
 * Retorna as sources com prioridade recalculada (1 = melhor).
 */
export function rankSources(sources: Source[]): Source[] {
  if (sources.length === 0) return [];

  // Calcular score para cada source
  const scored = sources.map((source) => ({
    source,
    score: calculateScore(source),
  }));

  // Ordenar por score (maior = melhor)
  scored.sort((a, b) => b.score - a.score);

  // Reatribuir prioridade sequencial
  return scored.map(({ source }, index) => ({
    ...source,
    priority: index + 1,
  }));
}

/**
 * Calcula score de qualidade (0-1) para uma Source.
 */
function calculateScore(source: Source): number {
  const textScore = scoreTextRichness(source);
  const visualScore = scoreVisualRichness(source);
  const confScore = source.confidenceScore;
  const typeScore = TYPE_BOOST[source.type] ?? 0.4;
  const narrativeScore = source.narrativeRole
    ? (NARRATIVE_BOOST[source.narrativeRole] ?? 0.5)
    : 0.3;
  const completeScore = scoreCompleteness(source);

  return (
    textScore * WEIGHTS.textRichness +
    visualScore * WEIGHTS.visualRichness +
    confScore * WEIGHTS.confidence +
    typeScore * WEIGHTS.typeBoost +
    narrativeScore * WEIGHTS.narrativeBoost +
    completeScore * WEIGHTS.completeness
  );
}

/**
 * Score de riqueza textual (0-1).
 */
function scoreTextRichness(source: Source): number {
  const textLen = source.text.length;
  if (textLen === 0) return 0;
  if (textLen < 30) return 0.2;
  if (textLen < 100) return 0.4;
  if (textLen < 300) return 0.7;
  if (textLen < 800) return 0.9;
  return 1.0;
}

/**
 * Score de riqueza visual (0-1).
 */
function scoreVisualRichness(source: Source): number {
  const assetCount = source.assetIds.length;
  if (assetCount === 0) return 0;
  if (assetCount === 1) return 0.6;
  if (assetCount <= 3) return 0.8;
  return 1.0;
}

/**
 * Score de completude (0-1).
 * Fontes completas têm texto + imagem + headline + summary.
 */
function scoreCompleteness(source: Source): number {
  let score = 0;
  const total = 5;

  if (source.text.length > 10) score++;
  if (source.assetIds.length > 0) score++;
  if (source.title.length > 3) score++;
  if (source.summary && source.summary.length > 10) score++;
  if (source.tags.length > 0) score++;

  return score / total;
}
