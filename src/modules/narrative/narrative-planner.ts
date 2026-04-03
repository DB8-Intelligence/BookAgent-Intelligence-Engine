/**
 * Narrative Planner
 *
 * Preenche os templates narrativos com Sources concretas,
 * produzindo NarrativePlans prontos para geração.
 *
 * Estratégia v1:
 * 1. Para cada template, iterar os beats
 * 2. Para cada beat, encontrar a melhor Source pelo papel (BeatRole → NarrativeRole/SourceType)
 * 3. Preencher headline, briefing, assetIds
 * 4. Calcular confiança do plano (baseada em quantos beats foram preenchidos)
 * 5. Gerar título sugerido para o output
 *
 * Evolução v2: IA generativa para customizar briefings e sugerir variações.
 */

import { v4 as uuid } from 'uuid';
import type { Source } from '../../domain/entities/source.js';
import type { NarrativePlan, NarrativeBeat } from '../../domain/entities/narrative.js';
import { NarrativeType, ToneOfVoice, BeatRole } from '../../domain/entities/narrative.js';
import { SourceType, NarrativeRole, OutputFormat } from '../../domain/value-objects/index.js';
import type { BeatTemplate, NarrativeTemplate } from './narrative-templates.js';
import { NARRATIVE_TEMPLATES, FORMAT_TO_NARRATIVE } from './narrative-templates.js';

// ---------------------------------------------------------------------------
// Mapping: BeatRole → quais Sources são boas candidatas
// ---------------------------------------------------------------------------

/** Mapeia BeatRole → SourceTypes preferenciais (em ordem de preferência) */
const BEAT_TO_SOURCE_TYPES: Record<BeatRole, SourceType[]> = {
  [BeatRole.HOOK]: [SourceType.HERO, SourceType.LIFESTYLE],
  [BeatRole.CONTEXT]: [SourceType.EDITORIAL, SourceType.COMPARATIVO, SourceType.INSTITUCIONAL],
  [BeatRole.SHOWCASE]: [SourceType.LIFESTYLE, SourceType.INFRAESTRUTURA, SourceType.PLANTA],
  [BeatRole.DIFFERENTIATOR]: [SourceType.DIFERENCIAL, SourceType.INFRAESTRUTURA],
  [BeatRole.SOCIAL_PROOF]: [SourceType.INSTITUCIONAL, SourceType.EDITORIAL],
  [BeatRole.LIFESTYLE]: [SourceType.LIFESTYLE, SourceType.DIFERENCIAL],
  [BeatRole.INVESTMENT]: [SourceType.INVESTIMENTO, SourceType.COMPARATIVO],
  [BeatRole.REINFORCEMENT]: [SourceType.DIFERENCIAL, SourceType.LIFESTYLE, SourceType.HERO],
  [BeatRole.CLOSING]: [SourceType.HERO, SourceType.EDITORIAL, SourceType.DIFERENCIAL],
  [BeatRole.CTA]: [SourceType.CTA, SourceType.HERO],
};

/** Mapeia BeatRole → NarrativeRoles preferenciais */
const BEAT_TO_NARRATIVE_ROLES: Record<BeatRole, NarrativeRole[]> = {
  [BeatRole.HOOK]: [NarrativeRole.HOOK],
  [BeatRole.CONTEXT]: [NarrativeRole.CONTEXT],
  [BeatRole.SHOWCASE]: [NarrativeRole.SHOWCASE],
  [BeatRole.DIFFERENTIATOR]: [NarrativeRole.DIFFERENTIATOR],
  [BeatRole.SOCIAL_PROOF]: [NarrativeRole.SOCIAL_PROOF],
  [BeatRole.LIFESTYLE]: [NarrativeRole.SHOWCASE],
  [BeatRole.INVESTMENT]: [NarrativeRole.CONTEXT],
  [BeatRole.REINFORCEMENT]: [NarrativeRole.DIFFERENTIATOR, NarrativeRole.SHOWCASE],
  [BeatRole.CLOSING]: [NarrativeRole.CLOSING],
  [BeatRole.CTA]: [NarrativeRole.CLOSING],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Gera NarrativePlans para todos os tipos de narrativa viáveis.
 *
 * Um plano é viável se todos os beats REQUIRED puderem ser preenchidos
 * com pelo menos uma Source.
 */
export function generateNarrativePlans(sources: Source[]): NarrativePlan[] {
  if (sources.length === 0) return [];

  const plans: NarrativePlan[] = [];

  for (const [, template] of Object.entries(NARRATIVE_TEMPLATES)) {
    const plan = buildPlan(template, sources);
    if (plan) {
      plans.push(plan);
    }
  }

  return plans;
}

/**
 * Gera NarrativePlan para um formato de output específico.
 */
export function generatePlanForFormat(
  formatKey: string,
  sources: Source[],
): NarrativePlan | null {
  const narrativeType = FORMAT_TO_NARRATIVE[formatKey];
  if (!narrativeType) return null;

  const template = NARRATIVE_TEMPLATES[narrativeType];
  if (!template) return null;

  return buildPlan(template, sources);
}

// ---------------------------------------------------------------------------
// Plan building
// ---------------------------------------------------------------------------

function buildPlan(
  template: NarrativeTemplate,
  sources: Source[],
): NarrativePlan | null {
  // Rastrear sources já usadas para evitar repetição excessiva
  const usedSourceIds = new Set<string>();
  const beats: NarrativeBeat[] = [];
  let requiredFilled = 0;
  let requiredTotal = 0;

  for (let i = 0; i < template.beats.length; i++) {
    const beatTemplate = template.beats[i];
    if (beatTemplate.required) requiredTotal++;

    const source = findBestSource(beatTemplate, sources, usedSourceIds);

    if (!source && beatTemplate.required) {
      // Beat obrigatório sem source → tentar fallback com any source
      const fallback = findFallbackSource(sources, usedSourceIds);
      if (!fallback) continue; // Skip, plan may still be viable
      beats.push(buildBeat(i, beatTemplate, fallback));
      usedSourceIds.add(fallback.id);
      requiredFilled++;
    } else if (source) {
      beats.push(buildBeat(i, beatTemplate, source));
      usedSourceIds.add(source.id);
      if (beatTemplate.required) requiredFilled++;
    }
    // Optional beat without source → skip silently
  }

  // Plan is viable only if at least 50% of required beats are filled
  if (requiredTotal > 0 && requiredFilled / requiredTotal < 0.5) {
    return null;
  }

  // Recalcular ordem sequencial
  beats.forEach((beat, idx) => {
    beat.order = idx;
  });

  const sourceIds = [...new Set(beats.map((b) => b.sourceId).filter((id): id is string => !!id))];
  const title = generatePlanTitle(template.narrativeType, sources, beats);
  const confidence = requiredTotal > 0 ? requiredFilled / requiredTotal : 0.5;

  const beatDuration = beats.reduce((sum, b) => sum + (b.estimatedDurationSeconds ?? 0), 0);
  const totalDuration = template.estimatedTotalDuration ?? (beatDuration > 0 ? beatDuration : null);

  return {
    id: uuid(),
    narrativeType: template.narrativeType,
    targetFormat: narrativeTypeToFormat(template.narrativeType),
    title,
    beats,
    tone: inferTone(template.defaultTone, sources),
    sourceIds,
    estimatedDurationSeconds: totalDuration,
    estimatedSlides: template.estimatedSlides,
    estimatedWordCount: template.estimatedWordCount,
    confidence: Math.round(confidence * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Source matching
// ---------------------------------------------------------------------------

function findBestSource(
  beatTemplate: BeatTemplate,
  sources: Source[],
  usedIds: Set<string>,
): Source | null {
  const preferredTypes = BEAT_TO_SOURCE_TYPES[beatTemplate.role] ?? [];
  const preferredRoles = BEAT_TO_NARRATIVE_ROLES[beatTemplate.role] ?? [];

  // 1. Try matching by NarrativeRole (strongest signal)
  for (const role of preferredRoles) {
    const match = sources.find(
      (s) => s.narrativeRole === role && !usedIds.has(s.id),
    );
    if (match) return match;
  }

  // 2. Try matching by SourceType
  for (const type of preferredTypes) {
    const match = sources.find(
      (s) => s.type === type && !usedIds.has(s.id),
    );
    if (match) return match;
  }

  // 3. Allow reuse of already-used sources (better than empty)
  for (const role of preferredRoles) {
    const match = sources.find((s) => s.narrativeRole === role);
    if (match) return match;
  }

  for (const type of preferredTypes) {
    const match = sources.find((s) => s.type === type);
    if (match) return match;
  }

  return null;
}

function findFallbackSource(
  sources: Source[],
  usedIds: Set<string>,
): Source | null {
  // Prefer unused sources with highest priority (lowest number)
  const unused = sources.filter((s) => !usedIds.has(s.id));
  if (unused.length > 0) return unused[0]; // Already sorted by priority

  // Allow any source
  return sources[0] ?? null;
}

// ---------------------------------------------------------------------------
// Beat building
// ---------------------------------------------------------------------------

function buildBeat(
  order: number,
  template: BeatTemplate,
  source: Source,
): NarrativeBeat {
  return {
    order,
    role: template.role,
    sourceId: source.id,
    suggestedHeadline: source.title || undefined,
    briefing: customizeBriefing(template.briefingTemplate, source),
    estimatedDurationSeconds: template.estimatedDurationSeconds,
    showVisuals: template.showVisuals && source.assetIds.length > 0,
    suggestedAssetIds: source.assetIds.slice(0, 3), // Max 3 per beat
  };
}

/**
 * Customiza o briefing do template com dados da Source.
 */
function customizeBriefing(template: string, source: Source): string {
  let briefing = template;

  if (source.title) {
    briefing += ` | Título: "${source.title}"`;
  }

  if (source.summary) {
    briefing += ` | Contexto: ${source.summary}`;
  }

  if (source.tags.length > 0) {
    briefing += ` | Keywords: ${source.tags.slice(0, 5).join(', ')}`;
  }

  return briefing;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generatePlanTitle(
  narrativeType: NarrativeType,
  sources: Source[],
  beats: NarrativeBeat[],
): string {
  // Try to use hero source title
  const heroSource = sources.find((s) => s.type === SourceType.HERO);
  const baseTitle = heroSource?.title ?? beats[0]?.suggestedHeadline ?? 'Empreendimento';

  const typeLabel: Record<NarrativeType, string> = {
    [NarrativeType.REEL_SHORT]: 'Reel',
    [NarrativeType.VIDEO_LONG]: 'Vídeo',
    [NarrativeType.CAROUSEL]: 'Carrossel',
    [NarrativeType.STORY]: 'Story',
    [NarrativeType.POST]: 'Post',
    [NarrativeType.BLOG]: 'Artigo',
    [NarrativeType.LANDING_PAGE]: 'Landing Page',
    [NarrativeType.PRESENTATION]: 'Apresentação',
    [NarrativeType.AUDIO_MONOLOGUE]: 'Áudio',
    [NarrativeType.AUDIO_PODCAST]: 'Podcast',
  };

  return `${typeLabel[narrativeType]} — ${baseTitle}`;
}

/**
 * Infere tom de voz com base nas sources disponíveis.
 * Se há muitas sources de investimento/institucional → informativo.
 * Se predominam lifestyle/hero → aspiracional.
 */
function inferTone(defaultTone: ToneOfVoice, sources: Source[]): ToneOfVoice {
  if (sources.length === 0) return defaultTone;

  const typeCounts = new Map<SourceType, number>();
  for (const s of sources) {
    typeCounts.set(s.type, (typeCounts.get(s.type) ?? 0) + 1);
  }

  const investCount = (typeCounts.get(SourceType.INVESTIMENTO) ?? 0) +
    (typeCounts.get(SourceType.COMPARATIVO) ?? 0);
  const lifestyleCount = (typeCounts.get(SourceType.LIFESTYLE) ?? 0) +
    (typeCounts.get(SourceType.HERO) ?? 0);
  const instCount = typeCounts.get(SourceType.INSTITUCIONAL) ?? 0;

  if (investCount > sources.length * 0.4) return ToneOfVoice.INFORMATIVO;
  if (instCount > sources.length * 0.3) return ToneOfVoice.INSTITUCIONAL;
  if (lifestyleCount > sources.length * 0.4) return ToneOfVoice.ASPIRACIONAL;

  return defaultTone;
}

function narrativeTypeToFormat(type: NarrativeType): OutputFormat {
  const map: Record<NarrativeType, OutputFormat> = {
    [NarrativeType.REEL_SHORT]: OutputFormat.REEL,
    [NarrativeType.VIDEO_LONG]: OutputFormat.VIDEO_LONG,
    [NarrativeType.CAROUSEL]: OutputFormat.CAROUSEL,
    [NarrativeType.STORY]: OutputFormat.STORY,
    [NarrativeType.POST]: OutputFormat.POST,
    [NarrativeType.BLOG]: OutputFormat.BLOG,
    [NarrativeType.LANDING_PAGE]: OutputFormat.LANDING_PAGE,
    [NarrativeType.PRESENTATION]: OutputFormat.PRESENTATION,
    [NarrativeType.AUDIO_MONOLOGUE]: OutputFormat.AUDIO_MONOLOGUE,
    [NarrativeType.AUDIO_PODCAST]: OutputFormat.AUDIO_PODCAST,
  };
  return map[type] ?? OutputFormat.REEL;
}
