/**
 * LP Plan Builder
 *
 * Monta LandingPagePlans completos a partir de OutputDecisions
 * de landing page aprovadas e seus NarrativePlans.
 *
 * Para cada output aprovado:
 * 1. Localiza o NarrativePlan de landing page
 * 2. Gera seções via lp-section-builder
 * 3. Resolve branding colors
 * 4. Define lead capture intents e conversion flow
 * 5. Gera título, slug e meta description
 * 6. Identifica hero asset
 */

import { v4 as uuid } from 'uuid';
import type { OutputDecision } from '../../domain/entities/output-decision.js';
import { ApprovalStatus } from '../../domain/entities/output-decision.js';
import type { NarrativePlan } from '../../domain/entities/narrative.js';
import { NarrativeType } from '../../domain/entities/narrative.js';
import type { Source } from '../../domain/entities/source.js';
import type { BrandingProfile } from '../../domain/entities/branding.js';
import { SourceType } from '../../domain/value-objects/index.js';
import type { LandingPagePlan } from '../../domain/entities/landing-page-plan.js';
import { LeadCaptureIntent, LPSectionType } from '../../domain/entities/landing-page-plan.js';

import { buildLPSections } from './lp-section-builder.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Constrói LandingPagePlans para todos os outputs de LP aprovados.
 */
export function buildLandingPagePlans(
  decisions: OutputDecision[],
  narratives: NarrativePlan[],
  sources: Source[],
  branding?: BrandingProfile,
): LandingPagePlan[] {
  const narrativeMap = new Map(narratives.map((n) => [n.id, n]));

  const lpDecisions = decisions.filter(
    (d) =>
      (d.status === ApprovalStatus.APPROVED || d.status === ApprovalStatus.APPROVED_WITH_GAPS) &&
      d.narrativeType === NarrativeType.LANDING_PAGE,
  );

  const plans: LandingPagePlan[] = [];

  for (const decision of lpDecisions) {
    const narrative = narrativeMap.get(decision.narrativePlanId);
    if (!narrative) continue;

    const plan = buildSinglePlan(decision, narrative, sources, branding);
    plans.push(plan);
  }

  return plans;
}

// ---------------------------------------------------------------------------
// Single plan builder
// ---------------------------------------------------------------------------

function buildSinglePlan(
  decision: OutputDecision,
  narrative: NarrativePlan,
  sources: Source[],
  branding?: BrandingProfile,
): LandingPagePlan {
  // Resolver sources do plano
  const planSourceIds = new Set(narrative.sourceIds);
  const planSources = sources.filter((s) => planSourceIds.has(s.id));

  // Build sections
  const sections = buildLPSections(narrative.beats, planSources, branding);

  // Título e slug
  const title = generateLPTitle(narrative, planSources);
  const slug = generateSlug(title);
  const metaDescription = generateMetaDescription(planSources, title);

  // Keywords
  const keywords = collectKeywords(planSources);

  // Hero asset
  const heroAssetId = findHeroAsset(planSources);

  // Brand colors
  const brandColors = resolveBrandColors(branding);

  // Lead capture intents
  const leadCaptureIntents = determineLeadIntents(sections);

  // Conversion flow
  const conversionFlow = determineConversionFlow(sections);

  return {
    id: uuid(),
    title,
    slug,
    metaDescription,
    narrativeType: narrative.narrativeType,
    narrativePlanId: narrative.id,
    outputDecisionId: decision.id,
    sections,
    tone: narrative.tone,
    leadCaptureIntents,
    conversionFlow,
    keywords,
    heroAssetId,
    brandColors,
    confidence: Math.round(decision.confidence * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Title / Slug / Meta
// ---------------------------------------------------------------------------

function generateLPTitle(narrative: NarrativePlan, sources: Source[]): string {
  const heroSource = sources.find((s) => s.type === SourceType.HERO);
  if (heroSource?.title && heroSource.title.length > 5 && heroSource.title.length < 60) {
    return heroSource.title;
  }

  const narrativeTitle = narrative.title
    .replace(/^Landing Page\s*[—–-]\s*/i, '')
    .trim();

  if (narrativeTitle.length > 5 && narrativeTitle.length < 60) {
    return narrativeTitle;
  }

  return 'Conheça Este Empreendimento';
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function generateMetaDescription(sources: Source[], title: string): string {
  const heroSource = sources.find((s) => s.type === SourceType.HERO);
  if (heroSource?.summary && heroSource.summary.length > 40) {
    return heroSource.summary.slice(0, 155);
  }
  return `${title} — Localização privilegiada, lazer completo e condições especiais. Agende sua visita.`.slice(0, 155);
}

// ---------------------------------------------------------------------------
// Keywords / Hero
// ---------------------------------------------------------------------------

function collectKeywords(sources: Source[]): string[] {
  const tags = new Set<string>();
  for (const s of sources) {
    for (const t of s.tags) tags.add(t);
  }
  return [...tags].slice(0, 15);
}

function findHeroAsset(sources: Source[]): string | undefined {
  const hero = sources.find((s) => s.type === SourceType.HERO);
  if (hero?.assetIds[0]) return hero.assetIds[0];

  const lifestyle = sources.find((s) => s.type === SourceType.LIFESTYLE);
  if (lifestyle?.assetIds[0]) return lifestyle.assetIds[0];

  return sources.find((s) => s.assetIds.length > 0)?.assetIds[0];
}

// ---------------------------------------------------------------------------
// Brand colors
// ---------------------------------------------------------------------------

function resolveBrandColors(branding?: BrandingProfile) {
  if (branding?.colors) {
    return {
      primary: branding.colors.primary,
      secondary: branding.colors.secondary,
      accent: branding.colors.accent,
      background: branding.colors.background,
      text: branding.colors.text,
    };
  }

  return {
    primary: '#1a1a2e',
    secondary: '#16213e',
    accent: '#0f3460',
    background: '#ffffff',
    text: '#1a1a1a',
  };
}

// ---------------------------------------------------------------------------
// Lead capture & conversion flow
// ---------------------------------------------------------------------------

function determineLeadIntents(
  sections: import('../../domain/entities/landing-page-plan.js').LandingPageSection[],
): LeadCaptureIntent[] {
  const intents: LeadCaptureIntent[] = [];

  const hasForm = sections.some((s) => s.sectionType === LPSectionType.CTA_FORM);
  const hasCTAInline = sections.some((s) => s.sectionType === LPSectionType.CTA_INLINE);

  if (hasForm) intents.push(LeadCaptureIntent.FORM_SUBMISSION);
  intents.push(LeadCaptureIntent.WHATSAPP_CONTACT);
  if (hasCTAInline) intents.push(LeadCaptureIntent.VISIT_SCHEDULE);
  intents.push(LeadCaptureIntent.PHONE_CALL);

  return intents;
}

function determineConversionFlow(
  sections: import('../../domain/entities/landing-page-plan.js').LandingPageSection[],
): string {
  const hasForm = sections.some((s) => s.sectionType === LPSectionType.CTA_FORM);
  const hasCTAInline = sections.some((s) => s.sectionType === LPSectionType.CTA_INLINE);

  if (hasForm && hasCTAInline) {
    return 'Hero CTA → Scroll → CTA inline (WhatsApp) → Formulário de captação → Footer contato';
  }
  if (hasForm) {
    return 'Hero CTA → Scroll → Formulário de captação → Footer contato';
  }
  if (hasCTAInline) {
    return 'Hero CTA → Scroll → CTA inline (WhatsApp) → Footer contato';
  }
  return 'Hero CTA → Scroll → Footer contato';
}
