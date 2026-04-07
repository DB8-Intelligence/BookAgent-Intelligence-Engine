/**
 * Score Evaluator — Content Quality & Scoring Engine
 *
 * Avalia a qualidade dos outputs em 4 dimensões:
 *   1. TEXT: repetição, clareza, comprimento
 *   2. VISUAL: diversidade de assets, repetição
 *   3. NARRATIVE: presença de hook, sequência lógica
 *   4. TECHNICAL: duração vs canal, densidade de texto
 *
 * Cada dimensão gera um score 0-100 com critérios detalhados.
 * O score final é a média ponderada das dimensões.
 *
 * Parte 70: Content Quality & Scoring Engine
 */

import type { MediaPlan, MediaScene } from '../../domain/entities/media-plan.js';
import type { NarrativePlan } from '../../domain/entities/narrative.js';
import { BeatRole } from '../../domain/entities/narrative.js';
import type { BlogPlan } from '../../domain/entities/blog-plan.js';
import type {
  ContentScore,
  DimensionScore,
  CriterionResult,
  ScoreBreakdown,
} from '../../domain/entities/content-score.js';
import {
  QualityDimension,
  DEFAULT_DIMENSION_WEIGHTS,
  scoreToLevel,
  scoreToDecision,
} from '../../domain/entities/content-score.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Avalia um MediaPlan e retorna ContentScore.
 */
export function scoreMediaPlan(
  plan: MediaPlan,
  narrative?: NarrativePlan,
): ContentScore {
  const dimensions: DimensionScore[] = [
    scoreTextDimension(plan),
    scoreVisualDimension(plan),
    scoreNarrativeDimension(plan, narrative),
    scoreTechnicalDimension(plan),
  ];

  return buildContentScore(plan.id, 'media_plan', dimensions);
}

/**
 * Avalia um NarrativePlan e retorna ContentScore.
 */
export function scoreNarrativePlan(plan: NarrativePlan): ContentScore {
  const dimensions: DimensionScore[] = [
    scoreNarrativeTextDimension(plan),
    scoreNarrativeStructureDimension(plan),
  ];

  return buildContentScore(plan.id, 'narrative', dimensions);
}

/**
 * Avalia um BlogPlan e retorna ContentScore.
 */
export function scoreBlogPlan(plan: BlogPlan): ContentScore {
  const dimensions: DimensionScore[] = [
    scoreBlogTextDimension(plan),
    scoreBlogStructureDimension(plan),
  ];

  return buildContentScore(plan.id, 'blog_plan', dimensions);
}

// ---------------------------------------------------------------------------
// TEXT Dimension (MediaPlan)
// ---------------------------------------------------------------------------

function scoreTextDimension(plan: MediaPlan): DimensionScore {
  const criteria: CriterionResult[] = [];
  const notes: string[] = [];

  // 1. Repetição de texto
  const allTexts = plan.scenes.flatMap((s) => s.textOverlays.map((t) => t.text.toLowerCase()));
  const uniqueTexts = new Set(allTexts);
  const repetitionRatio = allTexts.length > 0 ? uniqueTexts.size / allTexts.length : 1;
  const repetitionScore = Math.round(repetitionRatio * 100);
  criteria.push({
    name: 'repetição',
    score: repetitionScore,
    description: repetitionScore < 70
      ? `${allTexts.length - uniqueTexts.size} textos repetidos detectados`
      : 'Pouca repetição de texto',
  });

  // 2. Clareza (comprimento médio das headlines)
  const headlines = plan.scenes
    .flatMap((s) => s.textOverlays)
    .filter((t) => t.role === 'headline')
    .map((t) => t.text);

  let clarezaScore = 80; // default
  if (headlines.length > 0) {
    const avgLen = headlines.reduce((sum, h) => sum + h.length, 0) / headlines.length;
    // Ideal: 20-60 chars. Too short (<10) or too long (>100) penalizes
    if (avgLen < 10) clarezaScore = 40;
    else if (avgLen < 20) clarezaScore = 65;
    else if (avgLen <= 60) clarezaScore = 95;
    else if (avgLen <= 100) clarezaScore = 70;
    else clarezaScore = 45;
  }
  criteria.push({
    name: 'clareza',
    score: clarezaScore,
    description: `Headlines com comprimento médio adequado`,
  });

  // 3. Comprimento total de texto
  const totalChars = allTexts.join('').length;
  const scenesCount = plan.scenes.length;
  const charsPerScene = scenesCount > 0 ? totalChars / scenesCount : 0;
  let comprimentoScore = 80;
  if (charsPerScene === 0) {
    comprimentoScore = 30;
    notes.push('Cenas sem texto detectadas');
  } else if (charsPerScene < 20) {
    comprimentoScore = 55;
  } else if (charsPerScene <= 120) {
    comprimentoScore = 90;
  } else {
    comprimentoScore = 60;
    notes.push('Texto denso demais por cena');
  }
  criteria.push({
    name: 'comprimento',
    score: comprimentoScore,
    description: `~${Math.round(charsPerScene)} chars/cena`,
  });

  const score = Math.round(
    criteria.reduce((sum, c) => sum + c.score, 0) / criteria.length,
  );

  return {
    dimension: QualityDimension.TEXT,
    score,
    weight: DEFAULT_DIMENSION_WEIGHTS[QualityDimension.TEXT],
    criteria,
    notes,
  };
}

// ---------------------------------------------------------------------------
// VISUAL Dimension
// ---------------------------------------------------------------------------

function scoreVisualDimension(plan: MediaPlan): DimensionScore {
  const criteria: CriterionResult[] = [];
  const notes: string[] = [];

  // 1. Diversidade de assets
  const allAssetIds = plan.scenes.flatMap((s) => s.assetIds);
  const uniqueAssets = new Set(allAssetIds);
  const totalScenes = plan.scenes.length;

  let diversidadeScore = 80;
  if (totalScenes > 0 && uniqueAssets.size === 0) {
    diversidadeScore = 20;
    notes.push('Nenhum asset visual nas cenas');
  } else if (uniqueAssets.size < totalScenes * 0.5) {
    diversidadeScore = 50;
    notes.push('Poucos assets para o número de cenas');
  } else if (uniqueAssets.size >= totalScenes * 0.8) {
    diversidadeScore = 95;
  }
  criteria.push({
    name: 'diversidade_assets',
    score: diversidadeScore,
    description: `${uniqueAssets.size} assets únicos em ${totalScenes} cenas`,
  });

  // 2. Repetição de assets
  const assetCounts = new Map<string, number>();
  for (const id of allAssetIds) {
    assetCounts.set(id, (assetCounts.get(id) ?? 0) + 1);
  }
  const repeatedAssets = [...assetCounts.values()].filter((c) => c > 2).length;
  let repeticaoScore = 90;
  if (repeatedAssets > 3) {
    repeticaoScore = 40;
    notes.push(`${repeatedAssets} assets usados mais de 2x`);
  } else if (repeatedAssets > 0) {
    repeticaoScore = 70;
  }
  criteria.push({
    name: 'repetição_visual',
    score: repeticaoScore,
    description: repeatedAssets > 0
      ? `${repeatedAssets} assets repetidos excessivamente`
      : 'Sem repetição excessiva de assets',
  });

  const score = Math.round(
    criteria.reduce((sum, c) => sum + c.score, 0) / criteria.length,
  );

  return {
    dimension: QualityDimension.VISUAL,
    score,
    weight: DEFAULT_DIMENSION_WEIGHTS[QualityDimension.VISUAL],
    criteria,
    notes,
  };
}

// ---------------------------------------------------------------------------
// NARRATIVE Dimension
// ---------------------------------------------------------------------------

function scoreNarrativeDimension(
  plan: MediaPlan,
  narrative?: NarrativePlan,
): DimensionScore {
  const criteria: CriterionResult[] = [];
  const notes: string[] = [];
  const scenes = plan.scenes;

  // 1. Presença de hook
  const hasHook = scenes.some((s) => s.role === BeatRole.HOOK);
  const hookScore = hasHook ? 100 : 20;
  criteria.push({
    name: 'presença_hook',
    score: hookScore,
    description: hasHook ? 'Hook presente na abertura' : 'Sem hook — abertura fraca',
  });
  if (!hasHook) notes.push('Falta hook na abertura');

  // 2. Presença de CTA
  const hasCTA = scenes.some((s) => s.role === BeatRole.CTA);
  const ctaScore = hasCTA ? 100 : 30;
  criteria.push({
    name: 'presença_cta',
    score: ctaScore,
    description: hasCTA ? 'CTA presente' : 'Sem CTA — fechamento fraco',
  });

  // 3. Sequência lógica
  let sequenceScore = 80;
  if (scenes.length >= 3) {
    const firstRole = scenes[0]?.role;
    const lastRole = scenes[scenes.length - 1]?.role;

    // Hook should be first
    if (firstRole === BeatRole.HOOK) sequenceScore += 10;
    else sequenceScore -= 15;

    // CTA or CLOSING should be last
    if (lastRole === BeatRole.CTA || lastRole === BeatRole.CLOSING) sequenceScore += 10;
    else sequenceScore -= 10;

    sequenceScore = clamp(sequenceScore, 0, 100);
  } else if (scenes.length < 2) {
    sequenceScore = 40;
    notes.push('Muito poucas cenas para sequência narrativa');
  }
  criteria.push({
    name: 'sequência_lógica',
    score: sequenceScore,
    description: `${scenes.length} cenas em sequência`,
  });

  // 4. Confiança do NarrativePlan (se disponível)
  if (narrative) {
    const confidenceScore = Math.round(narrative.confidence * 100);
    criteria.push({
      name: 'confiança_narrativa',
      score: confidenceScore,
      description: `Confidence do plano narrativo: ${narrative.confidence}`,
    });
  }

  const score = Math.round(
    criteria.reduce((sum, c) => sum + c.score, 0) / criteria.length,
  );

  return {
    dimension: QualityDimension.NARRATIVE,
    score,
    weight: DEFAULT_DIMENSION_WEIGHTS[QualityDimension.NARRATIVE],
    criteria,
    notes,
  };
}

// ---------------------------------------------------------------------------
// TECHNICAL Dimension
// ---------------------------------------------------------------------------

function scoreTechnicalDimension(plan: MediaPlan): DimensionScore {
  const criteria: CriterionResult[] = [];
  const notes: string[] = [];

  // 1. Duração vs canal
  let durationScore = 80;
  const totalDuration = plan.totalDurationSeconds;

  if (totalDuration !== null) {
    const format = plan.format;
    // Reels: 15-90s ideal
    if (format === 'reel' || format === 'video_short') {
      if (totalDuration < 10) { durationScore = 40; notes.push('Muito curto para reel'); }
      else if (totalDuration <= 90) durationScore = 95;
      else { durationScore = 50; notes.push('Muito longo para reel'); }
    }
    // Stories: 5-15s
    else if (format === 'story') {
      if (totalDuration < 3) durationScore = 35;
      else if (totalDuration <= 15) durationScore = 95;
      else { durationScore = 55; notes.push('Muito longo para story'); }
    }
    // Video long: 60-300s
    else if (format === 'video_long') {
      if (totalDuration < 30) durationScore = 45;
      else if (totalDuration <= 300) durationScore = 90;
      else { durationScore = 60; notes.push('Vídeo muito longo'); }
    }
  }
  criteria.push({
    name: 'duração_vs_canal',
    score: durationScore,
    description: totalDuration !== null
      ? `${totalDuration}s para formato ${plan.format}`
      : 'Formato estático — duração N/A',
  });

  // 2. Densidade de texto por cena
  const scenesWithText = plan.scenes.filter((s) => s.textOverlays.length > 0);
  const avgOverlaysPerScene = plan.scenes.length > 0
    ? scenesWithText.reduce((sum, s) => sum + s.textOverlays.length, 0) / plan.scenes.length
    : 0;

  let densityScore = 80;
  if (avgOverlaysPerScene === 0) {
    densityScore = 40;
    notes.push('Sem texto overlay nas cenas');
  } else if (avgOverlaysPerScene > 4) {
    densityScore = 45;
    notes.push('Texto denso demais por cena');
  } else if (avgOverlaysPerScene >= 1 && avgOverlaysPerScene <= 3) {
    densityScore = 95;
  }
  criteria.push({
    name: 'densidade_texto',
    score: densityScore,
    description: `~${avgOverlaysPerScene.toFixed(1)} overlays/cena`,
  });

  // 3. Render readiness
  const readinessScore = plan.renderStatus === 'ready' ? 100
    : plan.renderStatus === 'partial' ? 70
    : plan.renderStatus === 'needs-assets' ? 40
    : plan.renderStatus === 'needs-text' ? 45
    : 20;
  criteria.push({
    name: 'render_readiness',
    score: readinessScore,
    description: `Render status: ${plan.renderStatus}`,
  });

  const score = Math.round(
    criteria.reduce((sum, c) => sum + c.score, 0) / criteria.length,
  );

  return {
    dimension: QualityDimension.TECHNICAL,
    score,
    weight: DEFAULT_DIMENSION_WEIGHTS[QualityDimension.TECHNICAL],
    criteria,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Narrative-only scoring
// ---------------------------------------------------------------------------

function scoreNarrativeTextDimension(plan: NarrativePlan): DimensionScore {
  const criteria: CriterionResult[] = [];
  const notes: string[] = [];

  // Headlines quality
  const headlines = plan.beats
    .map((b) => b.suggestedHeadline)
    .filter((h): h is string => !!h);

  const uniqueHeadlines = new Set(headlines.map((h) => h.toLowerCase()));
  const headlineRepScore = headlines.length > 0
    ? Math.round((uniqueHeadlines.size / headlines.length) * 100)
    : 70;
  criteria.push({
    name: 'repetição_headlines',
    score: headlineRepScore,
    description: `${uniqueHeadlines.size}/${headlines.length} headlines únicas`,
  });

  // Briefing quality (non-empty, reasonable length)
  const briefings = plan.beats.map((b) => b.briefing);
  const emptyBriefings = briefings.filter((b) => b.trim().length < 10).length;
  const briefingScore = briefings.length > 0
    ? Math.round(((briefings.length - emptyBriefings) / briefings.length) * 100)
    : 50;
  criteria.push({
    name: 'qualidade_briefings',
    score: briefingScore,
    description: emptyBriefings > 0
      ? `${emptyBriefings} briefings fracos`
      : 'Briefings completos',
  });

  const score = Math.round(criteria.reduce((sum, c) => sum + c.score, 0) / criteria.length);

  return {
    dimension: QualityDimension.TEXT,
    score,
    weight: 0.50,
    criteria,
    notes,
  };
}

function scoreNarrativeStructureDimension(plan: NarrativePlan): DimensionScore {
  const criteria: CriterionResult[] = [];
  const notes: string[] = [];

  const beats = plan.beats;
  const roles = beats.map((b) => b.role);

  // Hook presence
  const hasHook = roles.includes(BeatRole.HOOK);
  criteria.push({
    name: 'presença_hook',
    score: hasHook ? 100 : 20,
    description: hasHook ? 'Hook presente' : 'Sem hook',
  });

  // CTA presence
  const hasCTA = roles.includes(BeatRole.CTA);
  criteria.push({
    name: 'presença_cta',
    score: hasCTA ? 100 : 30,
    description: hasCTA ? 'CTA presente' : 'Sem CTA',
  });

  // Confidence
  criteria.push({
    name: 'confiança',
    score: Math.round(plan.confidence * 100),
    description: `Confidence: ${plan.confidence}`,
  });

  const score = Math.round(criteria.reduce((sum, c) => sum + c.score, 0) / criteria.length);

  return {
    dimension: QualityDimension.NARRATIVE,
    score,
    weight: 0.50,
    criteria,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Blog scoring
// ---------------------------------------------------------------------------

function scoreBlogTextDimension(plan: BlogPlan): DimensionScore {
  const criteria: CriterionResult[] = [];
  const notes: string[] = [];

  const sections = plan.sections;

  // Section count
  let sectionScore = 80;
  if (sections.length < 2) { sectionScore = 40; notes.push('Poucas seções'); }
  else if (sections.length >= 3 && sections.length <= 10) sectionScore = 95;
  else if (sections.length > 10) { sectionScore = 65; notes.push('Muitas seções'); }
  criteria.push({
    name: 'estrutura_seções',
    score: sectionScore,
    description: `${sections.length} seções no blog`,
  });

  // Title presence
  const hasTitle = !!plan.title && plan.title.length > 5;
  criteria.push({
    name: 'título',
    score: hasTitle ? 90 : 30,
    description: hasTitle ? 'Título presente e adequado' : 'Título ausente ou curto',
  });

  const score = Math.round(criteria.reduce((sum, c) => sum + c.score, 0) / criteria.length);
  return { dimension: QualityDimension.TEXT, score, weight: 0.60, criteria, notes };
}

function scoreBlogStructureDimension(plan: BlogPlan): DimensionScore {
  const criteria: CriterionResult[] = [];
  const notes: string[] = [];

  // Has intro + conclusion pattern
  const roles = plan.sections.map((s) => s.editorialRole);
  const hasIntro = roles.some((r) => r === 'introduction');
  const hasConclusion = roles.some((r) => r === 'conclusion' || r === 'cta');

  criteria.push({
    name: 'intro_conclusion',
    score: hasIntro && hasConclusion ? 95 : hasIntro || hasConclusion ? 65 : 30,
    description: `Intro: ${hasIntro ? 'sim' : 'não'}, Conclusão: ${hasConclusion ? 'sim' : 'não'}`,
  });

  const score = Math.round(criteria.reduce((sum, c) => sum + c.score, 0) / criteria.length);
  return { dimension: QualityDimension.NARRATIVE, score, weight: 0.40, criteria, notes };
}

// ---------------------------------------------------------------------------
// Score builder
// ---------------------------------------------------------------------------

function buildContentScore(
  targetId: string,
  targetType: string,
  dimensions: DimensionScore[],
): ContentScore {
  // Weighted average
  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  const weightedScore = totalWeight > 0
    ? dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) / totalWeight
    : 0;
  const finalScore = Math.round(weightedScore);

  // Collect all criteria
  const allCriteria = dimensions.flatMap((d) => d.criteria);
  const sorted = [...allCriteria].sort((a, b) => a.score - b.score);

  const weakPoints = sorted.slice(0, 3);
  const strongPoints = sorted.slice(-3).reverse();

  const breakdown: ScoreBreakdown = {
    dimensions,
    weakPoints,
    strongPoints,
  };

  return {
    targetId,
    targetType,
    score: finalScore,
    level: scoreToLevel(finalScore),
    decision: scoreToDecision(finalScore),
    breakdown,
    evaluatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
