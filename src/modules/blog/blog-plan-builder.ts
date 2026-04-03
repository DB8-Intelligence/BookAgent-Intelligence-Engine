/**
 * Blog Plan Builder
 *
 * Monta BlogPlans completos a partir de OutputDecisions de blog
 * aprovadas e seus NarrativePlans associados.
 *
 * Para cada output de blog aprovado:
 * 1. Localiza o NarrativePlan de blog
 * 2. Gera seções via section-builder
 * 3. Extrai introdução, conclusão e CTA dos beats
 * 4. Gera título, slug e meta description
 * 5. Coleta keywords de todas as sources
 * 6. Identifica hero asset
 * 7. Calcula estimativas e confiança
 */

import { v4 as uuid } from 'uuid';
import type { OutputDecision } from '../../domain/entities/output-decision.js';
import { ApprovalStatus } from '../../domain/entities/output-decision.js';
import type { NarrativePlan } from '../../domain/entities/narrative.js';
import { NarrativeType } from '../../domain/entities/narrative.js';
import type { Source } from '../../domain/entities/source.js';
import { SourceType } from '../../domain/value-objects/index.js';
import type { BlogPlan } from '../../domain/entities/blog-plan.js';

import {
  buildSections,
  extractIntroduction,
  extractConclusion,
  extractCTA,
} from './section-builder.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Constrói BlogPlans para todos os outputs de blog aprovados.
 */
export function buildBlogPlans(
  decisions: OutputDecision[],
  narratives: NarrativePlan[],
  sources: Source[],
): BlogPlan[] {
  const narrativeMap = new Map(narratives.map((n) => [n.id, n]));

  // Filtrar decisions de blog aprovadas
  const blogDecisions = decisions.filter(
    (d) =>
      (d.status === ApprovalStatus.APPROVED || d.status === ApprovalStatus.APPROVED_WITH_GAPS) &&
      d.narrativeType === NarrativeType.BLOG,
  );

  const plans: BlogPlan[] = [];

  for (const decision of blogDecisions) {
    const narrative = narrativeMap.get(decision.narrativePlanId);
    if (!narrative) continue;

    const plan = buildSingleBlogPlan(decision, narrative, sources);
    plans.push(plan);
  }

  return plans;
}

// ---------------------------------------------------------------------------
// Single plan builder
// ---------------------------------------------------------------------------

function buildSingleBlogPlan(
  decision: OutputDecision,
  narrative: NarrativePlan,
  sources: Source[],
): BlogPlan {
  // Resolver sources do plano
  const planSourceIds = new Set(narrative.sourceIds);
  const planSources = sources.filter((s) => planSourceIds.has(s.id));

  // Build sections do corpo
  const sections = buildSections(narrative.beats, planSources);

  // Extrair introdução, conclusão e CTA
  const introduction = extractIntroduction(narrative.beats, planSources);
  const conclusion = extractConclusion(narrative.beats, planSources);
  const ctaText = extractCTA(narrative.beats, planSources);

  // Gerar título e slug
  const title = generateBlogTitle(narrative, planSources);
  const slug = generateSlug(title);
  const metaDescription = generateMetaDescription(introduction, title);

  // Coletar keywords de todas as sources do plano
  const keywords = collectKeywords(planSources);

  // Identificar hero asset (da source tipo HERO, ou primeiro asset disponível)
  const heroAssetId = findHeroAsset(planSources);

  // Estimar word count total
  const sectionWords = sections.reduce((sum, s) => sum + s.estimatedWordCount, 0);
  const estimatedWordCount = sectionWords + 120 + 100 + 60; // intro + conclusion + CTA

  return {
    id: uuid(),
    title,
    slug,
    metaDescription,
    narrativeType: narrative.narrativeType,
    narrativePlanId: narrative.id,
    outputDecisionId: decision.id,
    introduction,
    sections,
    conclusion,
    ctaText,
    keywords,
    tone: narrative.tone,
    heroAssetId,
    estimatedWordCount,
    confidence: Math.round(decision.confidence * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Title generation
// ---------------------------------------------------------------------------

function generateBlogTitle(narrative: NarrativePlan, sources: Source[]): string {
  // Tentar usar título da source HERO
  const heroSource = sources.find((s) => s.type === SourceType.HERO);
  if (heroSource?.title && heroSource.title.length > 10 && heroSource.title.length < 80) {
    return `${heroSource.title}: Tudo Sobre Este Empreendimento`;
  }

  // Extrair nome do empreendimento do narrative title
  const narrativeTitle = narrative.title.replace(/^Artigo\s*[—–-]\s*/i, '').trim();
  if (narrativeTitle.length > 5 && narrativeTitle.length < 60) {
    return `Conheça o ${narrativeTitle}: Localização, Lazer e Diferenciais`;
  }

  // Fallback genérico
  return 'Guia Completo: Conheça Este Novo Empreendimento';
}

// ---------------------------------------------------------------------------
// Slug generation
// ---------------------------------------------------------------------------

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remover acentos
    .replace(/[^a-z0-9\s-]/g, '')    // remover caracteres especiais
    .replace(/\s+/g, '-')            // espaços → hifens
    .replace(/-+/g, '-')             // hifens múltiplos → um
    .replace(/^-|-$/g, '')           // trim hifens
    .slice(0, 80);                   // limitar tamanho
}

// ---------------------------------------------------------------------------
// Meta description
// ---------------------------------------------------------------------------

function generateMetaDescription(introduction: string, title: string): string {
  // Usar primeiras ~155 caracteres da introdução
  if (introduction.length >= 80) {
    const trimmed = introduction.slice(0, 152).trim();
    return trimmed.endsWith('.') ? trimmed : trimmed + '...';
  }

  // Fallback baseado no título
  return `${title}. Saiba tudo sobre localização, lazer, diferenciais e condições.`.slice(0, 155);
}

// ---------------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------------

function collectKeywords(sources: Source[]): string[] {
  const allTags = new Set<string>();
  for (const source of sources) {
    for (const tag of source.tags) {
      allTags.add(tag);
    }
  }

  // Top 15 keywords (já vêm ordenadas por frequência nas sources)
  return [...allTags].slice(0, 15);
}

// ---------------------------------------------------------------------------
// Hero asset
// ---------------------------------------------------------------------------

function findHeroAsset(sources: Source[]): string | undefined {
  // Prioridade: source HERO > source LIFESTYLE > primeira source com asset
  const heroSource = sources.find((s) => s.type === SourceType.HERO);
  if (heroSource?.assetIds[0]) return heroSource.assetIds[0];

  const lifestyleSource = sources.find((s) => s.type === SourceType.LIFESTYLE);
  if (lifestyleSource?.assetIds[0]) return lifestyleSource.assetIds[0];

  const anyWithAsset = sources.find((s) => s.assetIds.length > 0);
  return anyWithAsset?.assetIds[0];
}
