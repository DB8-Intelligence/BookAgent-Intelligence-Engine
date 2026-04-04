/**
 * Landing Page Exporter
 *
 * Serializa LandingPagePlan[] em ExportArtifact[] nos formatos:
 * - HTML (landing page completa com estrutura semântica e copy gerada)
 * - JSON (dados estruturados para renderização em frameworks SPA)
 *
 * Quando um AITextService é fornecido, o HTML contém copy de alta conversão
 * gerada por IA (ou localmente com fallback automático).
 */

import { v4 as uuid } from 'uuid';
import type { LandingPagePlan, LandingPageSection } from '../../domain/entities/landing-page-plan.js';
import { LPSectionType } from '../../domain/entities/landing-page-plan.js';
import { OutputFormat } from '../../domain/value-objects/index.js';
import type { ExportArtifact } from '../../domain/entities/export-artifact.js';
import {
  ExportFormat,
  ArtifactType,
  ArtifactStatus,
} from '../../domain/entities/export-artifact.js';
import type { AITextService } from '../../services/ai-text-service.js';
import type { GeneratedLandingPageCopy, GeneratedLPSection } from '../../generation/types.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Exporta LandingPagePlans como artefatos de landing page.
 * Para cada LandingPagePlan gera:
 * 1. HTML (página completa — com copy gerada quando AI disponível)
 * 2. JSON (dados estruturados para SPA)
 *
 * @param plans - LandingPagePlans gerados pelo pipeline
 * @param aiService - AITextService opcional; quando fornecido, ativa copy com IA
 */
export async function exportLandingPagePlans(
  plans: LandingPagePlan[],
  aiService?: AITextService | null,
): Promise<ExportArtifact[]> {
  const artifacts: ExportArtifact[] = [];

  for (const plan of plans) {
    // Gerar copy da landing page (AI ou local)
    let copy: GeneratedLandingPageCopy | null = null;
    if (aiService) {
      try {
        copy = await aiService.generateLandingPage(plan);
      } catch (err) {
        logger.warn(`[LPExporter] Copy generation failed for "${plan.title}": ${err}`);
      }
    }

    artifacts.push(buildHTMLArtifact(plan, copy));
    artifacts.push(buildJSONArtifact(plan));
  }

  return artifacts;
}

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

function buildHTMLArtifact(plan: LandingPagePlan, copy: GeneratedLandingPageCopy | null): ExportArtifact {
  const warnings: string[] = [];
  const html = copy
    ? renderEnrichedLandingPageHTML(plan, copy, warnings)
    : renderLandingPageHTML(plan, warnings);

  return {
    id: uuid(),
    artifactType: ArtifactType.LANDING_PAGE,
    exportFormat: ExportFormat.HTML,
    outputFormat: OutputFormat.LANDING_PAGE,
    narrativeType: plan.narrativeType,
    planId: plan.id,
    title: plan.title,
    content: html,
    sizeBytes: Buffer.byteLength(html, 'utf-8'),
    filePath: `storage/outputs/landing-page/${plan.slug}.html`,
    status: warnings.length > 0 ? ArtifactStatus.PARTIAL : ArtifactStatus.VALID,
    warnings,
    referencedAssetIds: collectLPAssetIds(plan),
    createdAt: new Date(),
  };
}

/** HTML com copy gerada por IA (V2) */
function renderEnrichedLandingPageHTML(
  plan: LandingPagePlan,
  copy: GeneratedLandingPageCopy,
  warnings: string[],
): string {
  const lines: string[] = [];
  const colors = plan.brandColors ?? {
    primary: '#1a1a2e',
    secondary: '#16213e',
    accent: '#e94560',
    background: '#ffffff',
    text: '#333333',
  };

  lines.push('<!DOCTYPE html>');
  lines.push('<html lang="pt-BR">');
  lines.push('<head>');
  lines.push('  <meta charset="UTF-8">');
  lines.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
  lines.push(`  <title>${escapeHTML(copy.title)}</title>`);
  lines.push(`  <meta name="description" content="${escapeHTML(copy.metaDescription)}">`);
  lines.push(`  <meta name="keywords" content="${plan.keywords.join(', ')}">`);
  lines.push(buildStyleBlock(colors));
  lines.push('</head>');
  lines.push('<body>');

  if (plan.sections.length === 0) {
    warnings.push('Landing page sem seções');
  }

  const hasHero = plan.sections.some((s) => s.sectionType === LPSectionType.HERO);
  if (!hasHero) {
    warnings.push('Landing page sem hero section');
  }

  // Render sections com copy gerada
  for (let i = 0; i < plan.sections.length; i++) {
    const planSection = plan.sections[i];
    const generatedSection = copy.sections[i];

    const isHero = planSection.sectionType === LPSectionType.HERO;
    const headline = isHero ? copy.heroHeadline : (generatedSection?.heading ?? planSection.heading ?? '');
    const subheadline = isHero ? copy.heroSubheadline : (planSection.subheading ?? '');

    lines.push(renderEnrichedSectionHTML(planSection, generatedSection, headline, subheadline));
  }

  lines.push('</body>');
  lines.push('</html>');

  return lines.join('\n');
}

function renderEnrichedSectionHTML(
  section: LandingPageSection,
  generated: GeneratedLPSection | undefined,
  headlineOverride: string,
  subheadlineOverride: string,
): string {
  const lines: string[] = [];
  const bgClass = section.backgroundType === 'image'
    ? 'section--dark'
    : section.backgroundType === 'gradient'
      ? 'section--accent'
      : 'section--light';

  lines.push(`<section class="section ${bgClass}" data-type="${section.sectionType}" data-role="${section.conversionRole}">`);
  lines.push('  <div class="container">');

  const headingText = headlineOverride || generated?.heading || section.heading || '';
  if (headingText) {
    const tag = section.sectionType === LPSectionType.HERO ? 'h1' : 'h2';
    lines.push(`    <${tag}>${escapeHTML(headingText)}</${tag}>`);
  }

  if (subheadlineOverride) {
    lines.push(`    <p class="subheading">${escapeHTML(subheadlineOverride)}</p>`);
  }

  // Hero image
  if (section.assetIds.length > 0 && section.sectionType === LPSectionType.HERO) {
    lines.push('    <div class="hero-image">');
    lines.push(`      <img src="{{asset:${section.assetIds[0]}}}" alt="${escapeHTML(headingText)}">`);
    lines.push('    </div>');
  }

  // Gallery
  if (section.sectionType === LPSectionType.GALLERY && section.assetIds.length > 0) {
    lines.push('    <div class="gallery">');
    for (const assetId of section.assetIds) {
      lines.push(`      <img src="{{asset:${assetId}}}" alt="">`);
    }
    lines.push('    </div>');
  }

  // Body copy from AI (or raw contentPoints)
  const bodyText = generated?.body ?? '';
  if (bodyText) {
    for (const para of bodyText.split('\n').filter(Boolean)) {
      lines.push(`    <p>${escapeHTML(para.trim())}</p>`);
    }
  }

  // Bullet points (AI-generated or raw contentPoints)
  const bullets = generated?.bulletPoints?.length
    ? generated.bulletPoints
    : section.contentPoints.length > 0 ? section.contentPoints : [];

  if (bullets.length > 0) {
    lines.push('    <ul class="content-points">');
    for (const point of bullets) {
      if (point.trim()) {
        lines.push(`      <li>${escapeHTML(point.trim())}</li>`);
      }
    }
    lines.push('    </ul>');
  }

  // Section images (non-hero, non-gallery)
  if (section.assetIds.length > 0 &&
      section.sectionType !== LPSectionType.HERO &&
      section.sectionType !== LPSectionType.GALLERY) {
    lines.push('    <div class="section-image">');
    lines.push(`      <img src="{{asset:${section.assetIds[0]}}}" alt="${escapeHTML(headingText)}">`);
    lines.push('    </div>');
  }

  // CTA button (AI copy preferred)
  const ctaText = generated?.ctaText || section.ctaText;
  if (ctaText) {
    lines.push(`    <a href="#contato" class="cta-button">${escapeHTML(ctaText)}</a>`);
  }

  // Form (CTA_FORM)
  if (section.sectionType === LPSectionType.CTA_FORM) {
    lines.push('    <form id="contato" class="lead-form">');
    const fields = generated?.bulletPoints?.length ? generated.bulletPoints : section.contentPoints;
    for (const field of fields) {
      const fieldId = field.toLowerCase().replace(/\s+/g, '-');
      lines.push('      <div class="form-field">');
      lines.push(`        <label for="${fieldId}">${escapeHTML(field)}</label>`);
      lines.push(`        <input type="text" id="${fieldId}" name="${fieldId}" placeholder="${escapeHTML(field)}">`);
      lines.push('      </div>');
    }
    if (ctaText) {
      lines.push(`      <button type="submit" class="cta-button">${escapeHTML(ctaText)}</button>`);
    }
    lines.push('    </form>');
  }

  lines.push('  </div>');
  lines.push('</section>');

  return lines.join('\n');
}

/** HTML com dados brutos do plano (V1 — fallback) */
function renderLandingPageHTML(plan: LandingPagePlan, warnings: string[]): string {
  const lines: string[] = [];
  const colors = plan.brandColors ?? {
    primary: '#1a1a2e',
    secondary: '#16213e',
    accent: '#e94560',
    background: '#ffffff',
    text: '#333333',
  };

  lines.push('<!DOCTYPE html>');
  lines.push('<html lang="pt-BR">');
  lines.push('<head>');
  lines.push('  <meta charset="UTF-8">');
  lines.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
  lines.push(`  <title>${escapeHTML(plan.title)}</title>`);
  lines.push(`  <meta name="description" content="${escapeHTML(plan.metaDescription)}">`);
  lines.push(`  <meta name="keywords" content="${plan.keywords.join(', ')}">`);
  lines.push(buildStyleBlock(colors));
  lines.push('</head>');
  lines.push('<body>');

  if (plan.sections.length === 0) {
    warnings.push('Landing page sem seções');
  }
  const hasHero = plan.sections.some((s) => s.sectionType === LPSectionType.HERO);
  if (!hasHero) {
    warnings.push('Landing page sem hero section');
  }

  for (const section of plan.sections) {
    lines.push(renderSectionHTML(section));
  }

  lines.push('</body>');
  lines.push('</html>');

  return lines.join('\n');
}

function renderSectionHTML(section: LandingPageSection): string {
  const lines: string[] = [];
  const bgClass = section.backgroundType === 'image'
    ? 'section--dark'
    : section.backgroundType === 'gradient'
      ? 'section--accent'
      : 'section--light';

  lines.push(`<section class="section ${bgClass}" data-type="${section.sectionType}" data-role="${section.conversionRole}">`);
  lines.push('  <div class="container">');

  if (section.heading) {
    const tag = section.sectionType === LPSectionType.HERO ? 'h1' : 'h2';
    lines.push(`    <${tag}>${escapeHTML(section.heading)}</${tag}>`);
  }

  if (section.subheading) {
    lines.push(`    <p class="subheading">${escapeHTML(section.subheading)}</p>`);
  }

  if (section.assetIds.length > 0 && section.sectionType === LPSectionType.HERO) {
    lines.push(`    <div class="hero-image">`);
    lines.push(`      <img src="{{asset:${section.assetIds[0]}}}" alt="${escapeHTML(section.heading ?? '')}">`);
    lines.push(`    </div>`);
  }

  if (section.sectionType === LPSectionType.GALLERY && section.assetIds.length > 0) {
    lines.push('    <div class="gallery">');
    for (const assetId of section.assetIds) {
      lines.push(`      <img src="{{asset:${assetId}}}" alt="">`);
    }
    lines.push('    </div>');
  }

  if (section.contentPoints && section.contentPoints.length > 0) {
    lines.push('    <ul class="content-points">');
    for (const point of section.contentPoints) {
      lines.push(`      <li>${escapeHTML(point)}</li>`);
    }
    lines.push('    </ul>');
  }

  if (section.assetIds.length > 0 &&
      section.sectionType !== LPSectionType.HERO &&
      section.sectionType !== LPSectionType.GALLERY) {
    lines.push(`    <div class="section-image">`);
    lines.push(`      <img src="{{asset:${section.assetIds[0]}}}" alt="${escapeHTML(section.heading ?? '')}">`);
    lines.push(`    </div>`);
  }

  if (section.ctaText) {
    lines.push(`    <a href="#contato" class="cta-button">${escapeHTML(section.ctaText)}</a>`);
  }

  if (section.sectionType === LPSectionType.CTA_FORM) {
    lines.push('    <form id="contato" class="lead-form">');
    if (section.contentPoints) {
      for (const field of section.contentPoints) {
        const fieldId = field.toLowerCase().replace(/\s+/g, '-');
        lines.push(`      <div class="form-field">`);
        lines.push(`        <label for="${fieldId}">${escapeHTML(field)}</label>`);
        lines.push(`        <input type="text" id="${fieldId}" name="${fieldId}" placeholder="${escapeHTML(field)}">`);
        lines.push(`      </div>`);
      }
    }
    if (section.ctaText) {
      lines.push(`      <button type="submit" class="cta-button">${escapeHTML(section.ctaText)}</button>`);
    }
    lines.push('    </form>');
  }

  lines.push('  </div>');
  lines.push('</section>');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// JSON builder
// ---------------------------------------------------------------------------

function buildJSONArtifact(plan: LandingPagePlan): ExportArtifact {
  const content = JSON.stringify({
    id: plan.id,
    title: plan.title,
    slug: plan.slug,
    metaDescription: plan.metaDescription,
    keywords: plan.keywords,
    brandColors: plan.brandColors,
    leadCaptureIntents: plan.leadCaptureIntents,
    conversionFlow: plan.conversionFlow,
    sections: plan.sections.map((s) => ({
      sectionType: s.sectionType,
      conversionRole: s.conversionRole,
      heading: s.heading,
      subheading: s.subheading,
      contentPoints: s.contentPoints,
      ctaText: s.ctaText,
      assetIds: s.assetIds,
      backgroundType: s.backgroundType,
      backgroundColor: s.backgroundColor,
    })),
    tone: plan.tone,
    confidence: plan.confidence,
  }, null, 2);

  return {
    id: uuid(),
    artifactType: ArtifactType.LANDING_PAGE,
    exportFormat: ExportFormat.JSON,
    outputFormat: OutputFormat.LANDING_PAGE,
    narrativeType: plan.narrativeType,
    planId: plan.id,
    title: plan.title,
    content,
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
    status: ArtifactStatus.VALID,
    warnings: [],
    referencedAssetIds: collectLPAssetIds(plan),
    createdAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildStyleBlock(colors: {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}): string {
  return [
    '  <style>',
    `    :root {`,
    `      --color-primary: ${colors.primary};`,
    `      --color-secondary: ${colors.secondary};`,
    `      --color-accent: ${colors.accent};`,
    `      --color-bg: ${colors.background};`,
    `      --color-text: ${colors.text};`,
    `    }`,
    `    * { margin: 0; padding: 0; box-sizing: border-box; }`,
    `    body { font-family: system-ui, sans-serif; color: var(--color-text); }`,
    `    .section { padding: 4rem 2rem; }`,
    `    .section--dark { background: var(--color-primary); color: #fff; }`,
    `    .section--light { background: var(--color-bg); }`,
    `    .section--accent { background: var(--color-accent); color: #fff; }`,
    `    .container { max-width: 1200px; margin: 0 auto; }`,
    `    h1, h2, h3 { margin-bottom: 1rem; }`,
    `    p { margin-bottom: 0.75rem; line-height: 1.6; }`,
    `    .subheading { font-size: 1.1rem; opacity: 0.85; margin-bottom: 1.5rem; }`,
    `    .cta-button { display: inline-block; padding: 1rem 2rem; background: var(--color-accent); color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 1rem; }`,
    `    .content-points { list-style: none; padding: 0; }`,
    `    .content-points li { padding: 0.5rem 0; padding-left: 1.5rem; position: relative; }`,
    `    .content-points li::before { content: "✓"; position: absolute; left: 0; color: var(--color-accent); }`,
    '  </style>',
  ].join('\n');
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function collectLPAssetIds(plan: LandingPagePlan): string[] {
  const ids = new Set<string>();
  if (plan.heroAssetId) ids.add(plan.heroAssetId);
  for (const section of plan.sections) {
    for (const id of section.assetIds) {
      ids.add(id);
    }
  }
  return Array.from(ids);
}
