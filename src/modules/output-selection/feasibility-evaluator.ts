/**
 * Feasibility Evaluator
 *
 * Avalia a viabilidade de cada NarrativePlan para geração real.
 *
 * Critérios avaliados:
 * 1. Asset coverage: assets disponíveis ≥ minAssets do OutputSpec
 * 2. Source type coverage: tipos obrigatórios presentes
 * 3. Beat fill rate: beats obrigatórios preenchidos ≥ threshold
 * 4. Narrative confidence: confiança do plano ≥ threshold
 * 5. Visual coverage: beats visuais têm assets sugeridos
 *
 * Retorna FeasibilityGap[] e um score de viabilidade (0-1)
 * que determina se o output é aprovado, aprovado com gaps, ou rejeitado.
 */

import type { NarrativePlan } from '../../domain/entities/narrative.js';
import type { Source } from '../../domain/entities/source.js';
import type { Asset } from '../../domain/entities/asset.js';
import type { FeasibilityGap } from '../../domain/entities/output-decision.js';
import { OUTPUT_SPECS } from '../../domain/entities/output-spec.js';
import type { NarrativeType } from '../../domain/entities/narrative.js';
import { OutputComplexity } from '../../domain/entities/output-decision.js';

/** Threshold mínimo de beats obrigatórios preenchidos para aprovação */
const MIN_REQUIRED_BEAT_FILL_RATE = 0.6;

/** Threshold de confiança mínima da narrativa */
const MIN_NARRATIVE_CONFIDENCE = 0.4;

/** Threshold de confiança para aprovação plena (sem gaps) */
const FULL_APPROVAL_CONFIDENCE = 0.7;

// ---------------------------------------------------------------------------
// Mapping NarrativeType → OutputSpec key
// ---------------------------------------------------------------------------

const NARRATIVE_TO_SPEC_KEY: Record<string, string> = {
  'reel-short': 'reel',
  'video-long': 'video_long',
  'carousel': 'carousel',
  'story': 'story',
  'post': 'post',
  'blog': 'blog',
  'landing-page': 'landing_page',
  'presentation': 'presentation',
  'audio-monologue': 'audio_monologue',
  'audio-podcast': 'audio_podcast',
};

// ---------------------------------------------------------------------------
// Complexity mapping
// ---------------------------------------------------------------------------

const FORMAT_COMPLEXITY: Record<string, OutputComplexity> = {
  post: OutputComplexity.LOW,
  story: OutputComplexity.LOW,
  reel: OutputComplexity.MEDIUM,
  carousel: OutputComplexity.MEDIUM,
  video_short: OutputComplexity.MEDIUM,
  blog: OutputComplexity.HIGH,
  landing_page: OutputComplexity.HIGH,
  presentation: OutputComplexity.HIGH,
  video_long: OutputComplexity.VERY_HIGH,
  audio_monologue: OutputComplexity.HIGH,
  audio_podcast: OutputComplexity.VERY_HIGH,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FeasibilityResult {
  score: number;              // 0-1, viabilidade geral
  gaps: FeasibilityGap[];
  requiredAssetCount: number;
  availableAssetCount: number;
  requiredSourceTypes: string[];
  availableSourceTypes: string[];
  totalBeats: number;
  filledBeats: number;
  requiredBeatsFilled: number;
  requiredBeatsTotal: number;
  complexity: OutputComplexity;
  requiresPersonalization: boolean;
}

/**
 * Avalia a viabilidade de um NarrativePlan para geração.
 */
export function evaluateFeasibility(
  plan: NarrativePlan,
  sources: Source[],
  assets: Asset[],
): FeasibilityResult {
  const gaps: FeasibilityGap[] = [];
  const specKey = NARRATIVE_TO_SPEC_KEY[plan.narrativeType] ?? plan.targetFormat;
  const spec = OUTPUT_SPECS[specKey];

  // Coletar source IDs e types presentes no plano
  const planSourceIds = new Set(plan.sourceIds);
  const planSources = sources.filter((s) => planSourceIds.has(s.id));
  const planSourceTypes = [...new Set(planSources.map((s) => String(s.type)))];

  // Coletar asset IDs presentes nos beats
  const planAssetIds = new Set<string>();
  for (const beat of plan.beats) {
    for (const id of beat.suggestedAssetIds) {
      planAssetIds.add(id);
    }
  }
  const availableAssetCount = planAssetIds.size;

  // Contar beats
  const totalBeats = plan.beats.length;
  const filledBeats = plan.beats.filter((b) => b.sourceId).length;

  // Contar beats obrigatórios (via template comparison não disponível aqui,
  // então usamos heurística: beats com sourceId preenchido vs total)
  // Para v1, assumimos que filledBeats == requiredBeatsFilled
  const requiredBeatsTotal = totalBeats; // Simplificação v1
  const requiredBeatsFilled = filledBeats;

  // --- Critério 1: Asset coverage ---
  const requiredAssetCount = spec?.minAssets ?? 1;
  if (availableAssetCount < requiredAssetCount) {
    gaps.push({
      criterion: 'asset-count',
      required: requiredAssetCount,
      actual: availableAssetCount,
      blocking: availableAssetCount === 0 && requiredAssetCount > 0,
    });
  }

  // --- Critério 2: Source type coverage ---
  const requiredSourceTypes = spec?.requiredSourceTypes?.map(String) ?? [];
  const missingTypes = requiredSourceTypes.filter(
    (t) => !planSourceTypes.includes(t),
  );
  if (missingTypes.length > 0) {
    gaps.push({
      criterion: 'source-type-coverage',
      required: requiredSourceTypes.join(', '),
      actual: planSourceTypes.join(', ') || '(nenhum)',
      blocking: false, // Tipos ausentes não bloqueiam, apenas reduzem confiança
    });
  }

  // --- Critério 3: Beat fill rate ---
  const beatFillRate = totalBeats > 0 ? filledBeats / totalBeats : 0;
  if (beatFillRate < MIN_REQUIRED_BEAT_FILL_RATE) {
    gaps.push({
      criterion: 'beat-fill-rate',
      required: `${Math.round(MIN_REQUIRED_BEAT_FILL_RATE * 100)}%`,
      actual: `${Math.round(beatFillRate * 100)}%`,
      blocking: beatFillRate < 0.3,
    });
  }

  // --- Critério 4: Narrative confidence ---
  if (plan.confidence < MIN_NARRATIVE_CONFIDENCE) {
    gaps.push({
      criterion: 'narrative-confidence',
      required: MIN_NARRATIVE_CONFIDENCE,
      actual: plan.confidence,
      blocking: plan.confidence < 0.2,
    });
  }

  // --- Critério 5: Visual coverage ---
  const visualBeats = plan.beats.filter((b) => b.showVisuals);
  const visualBeatsWithAssets = visualBeats.filter(
    (b) => b.suggestedAssetIds.length > 0,
  );
  if (visualBeats.length > 0) {
    const visualRate = visualBeatsWithAssets.length / visualBeats.length;
    if (visualRate < 0.5) {
      gaps.push({
        criterion: 'visual-coverage',
        required: `≥50% beats visuais com assets`,
        actual: `${Math.round(visualRate * 100)}%`,
        blocking: false,
      });
    }
  }

  // --- Calcular score de viabilidade ---
  const hasBlockingGap = gaps.some((g) => g.blocking);
  let score: number;

  if (hasBlockingGap) {
    score = 0.1; // Quase inviável
  } else {
    // Score composto
    const assetScore = requiredAssetCount > 0
      ? Math.min(1, availableAssetCount / requiredAssetCount)
      : 1;
    const typeScore = requiredSourceTypes.length > 0
      ? 1 - (missingTypes.length / requiredSourceTypes.length)
      : 1;
    const beatScore = beatFillRate;
    const confScore = plan.confidence;

    score = (
      assetScore * 0.25 +
      typeScore * 0.20 +
      beatScore * 0.30 +
      confScore * 0.25
    );
  }

  // Complexity
  const complexity = FORMAT_COMPLEXITY[specKey] ?? OutputComplexity.MEDIUM;

  // Personalization needed?
  const hasCTA = plan.beats.some((b) => b.role === 'cta');
  const hasForm = spec?.ctaMode === 'form' || spec?.ctaMode === 'full';
  const requiresPersonalization = hasCTA && hasForm;

  return {
    score,
    gaps,
    requiredAssetCount,
    availableAssetCount,
    requiredSourceTypes,
    availableSourceTypes: planSourceTypes,
    totalBeats,
    filledBeats,
    requiredBeatsFilled,
    requiredBeatsTotal,
    complexity,
    requiresPersonalization,
  };
}

/**
 * Determina o ApprovalStatus com base no score e nos gaps.
 */
export function determineApprovalStatus(
  score: number,
  gaps: FeasibilityGap[],
): 'approved' | 'approved-with-gaps' | 'rejected' {
  const hasBlockingGap = gaps.some((g) => g.blocking);

  if (hasBlockingGap || score < 0.3) return 'rejected';
  if (score >= FULL_APPROVAL_CONFIDENCE && gaps.length === 0) return 'approved';
  if (score >= MIN_NARRATIVE_CONFIDENCE) return 'approved-with-gaps';
  return 'rejected';
}
