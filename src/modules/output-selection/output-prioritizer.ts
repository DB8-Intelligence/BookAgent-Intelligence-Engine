/**
 * Output Prioritizer
 *
 * Ordena os outputs aprovados por prioridade de geração e
 * detecta redundâncias entre outputs similares.
 *
 * Critérios de priorização:
 * 1. Score de viabilidade (mais viável = mais prioritário)
 * 2. Impacto estimado do formato (reel e carousel antes de blog)
 * 3. Complexidade de geração (mais simples primeiro)
 * 4. Diversidade de formato (evitar redundância)
 *
 * Detecção de redundância:
 * - Reel + Video Short com mesmas fontes → defer o de menor score
 * - Story com poucos beats → defer se carousel já aprovado
 * - Post simples → defer se carousel já aprovado
 */

import type { OutputDecision } from '../../domain/entities/output-decision.js';
import { ApprovalStatus, OutputComplexity } from '../../domain/entities/output-decision.js';

/** Impacto relativo de cada formato (1.0 = máximo) */
const FORMAT_IMPACT: Record<string, number> = {
  reel: 1.0,
  carousel: 0.95,
  landing_page: 0.9,
  blog: 0.85,
  video_long: 0.8,
  presentation: 0.75,
  story: 0.7,
  video_short: 0.65,
  post: 0.6,
  audio_podcast: 0.55,
  audio_monologue: 0.5,
};

/** Custo de complexidade (inverso — menor é melhor para prioridade) */
const COMPLEXITY_COST: Record<OutputComplexity, number> = {
  [OutputComplexity.LOW]: 0,
  [OutputComplexity.MEDIUM]: 0.1,
  [OutputComplexity.HIGH]: 0.2,
  [OutputComplexity.VERY_HIGH]: 0.3,
};

/** Pares redundantes: [formatA, formatB] → o segundo é candidato a defer */
const REDUNDANCY_PAIRS: Array<[string, string]> = [
  ['reel', 'video_short'],     // Reel e Video Short são muito similares
  ['carousel', 'post'],        // Carousel subsume post
  ['carousel', 'story'],       // Carousel subsume story simples
  ['blog', 'audio_monologue'], // Blog e monólogo cobrem mesmo conteúdo
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Prioriza outputs aprovados e marca redundâncias como deferred.
 */
export function prioritizeOutputs(decisions: OutputDecision[]): OutputDecision[] {
  // Separar aprovados e rejeitados
  const approved = decisions.filter(
    (d) => d.status === ApprovalStatus.APPROVED || d.status === ApprovalStatus.APPROVED_WITH_GAPS,
  );
  const rejected = decisions.filter(
    (d) => d.status === ApprovalStatus.REJECTED,
  );

  // Calcular score de prioridade para cada aprovado
  const scored = approved.map((d) => ({
    decision: d,
    priorityScore: calculatePriorityScore(d),
  }));

  // Ordenar por score (maior = mais prioritário)
  scored.sort((a, b) => b.priorityScore - a.priorityScore);

  // Detectar e marcar redundâncias
  const deferred = detectRedundancies(scored.map((s) => s.decision));

  // Reatribuir prioridade sequencial
  let priority = 1;
  const result: OutputDecision[] = [];

  for (const { decision } of scored) {
    if (deferred.has(decision.id)) {
      result.push({
        ...decision,
        status: ApprovalStatus.DEFERRED,
        priority: 99,
        reason: `Adiado por redundância com output de maior prioridade`,
      });
    } else {
      result.push({
        ...decision,
        priority,
      });
      priority++;
    }
  }

  // Adicionar rejeitados ao final
  for (const d of rejected) {
    result.push({ ...d, priority: 99 });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function calculatePriorityScore(decision: OutputDecision): number {
  const feasibilityWeight = 0.40;
  const impactWeight = 0.35;
  const complexityWeight = 0.25;

  const feasibility = decision.confidence;
  const impact = FORMAT_IMPACT[decision.format] ?? 0.5;
  const complexityCost = COMPLEXITY_COST[decision.complexity] ?? 0.15;

  return (
    feasibility * feasibilityWeight +
    impact * impactWeight +
    (1 - complexityCost) * complexityWeight
  );
}

// ---------------------------------------------------------------------------
// Redundancy detection
// ---------------------------------------------------------------------------

function detectRedundancies(decisions: OutputDecision[]): Set<string> {
  const deferred = new Set<string>();
  const approvedFormats = new Map<string, OutputDecision>();

  for (const d of decisions) {
    approvedFormats.set(d.format, d);
  }

  for (const [formatA, formatB] of REDUNDANCY_PAIRS) {
    const decisionA = approvedFormats.get(formatA);
    const decisionB = approvedFormats.get(formatB);

    if (decisionA && decisionB && !deferred.has(decisionA.id) && !deferred.has(decisionB.id)) {
      // Defer o de menor confiança
      if (decisionA.confidence >= decisionB.confidence) {
        deferred.add(decisionB.id);
      } else {
        deferred.add(decisionA.id);
      }
    }
  }

  return deferred;
}
