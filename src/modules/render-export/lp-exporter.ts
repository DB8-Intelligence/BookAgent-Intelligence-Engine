/**
 * Landing Page Exporter
 *
 * Serializa LandingPagePlan[] em ExportArtifact[] nos formatos:
 * - HTML (landing page completa com estrutura semântica)
 * - JSON (dados estruturados para renderização em frameworks SPA)
 *
 * Gera landing pages de conversão com:
 * - Hero section com CTA
 * - Seções de conteúdo seguindo modelo AIDA
 * - Formulário de captura de leads
 * - Footer com dados de contato
 * - Referências a assets por seção
 * - Cores e branding inline
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Exporta LandingPagePlans como artefatos de landing page.
 * Para cada LandingPagePlan gera:
 * 1. HTML (página completa)
 * 2. JSON (dados estruturados para SPA)
 */
export function exportLandingPagePlans(plans: LandingPagePlan[]): ExportArtifact[] {
  const artifacts: ExportArtifact[] = [];

  for (const plan of plans) {
    artifacts.push(buildHTMLArtifact(plan));
    artifacts.push(buildJSONArtifact(plan));
  }

  return artifacts;
}

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

function buildHTMLArtifact(plan: LandingPagePlan): ExportArtifact {
  const warnings: string[] = [];
  const html = renderLandingPageHTML(plan, warnings);

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

function renderLandingPageHTML(plan: LandingPagePlan, warnings: string[]): string {
  const lines: string[] = [];
  const colors = plan.brandColors ?? {
    primary: '#1a1a2e',
    secondary: '#16213e',
    accent: '#e94560',
    background: '#ffffff',
    text: '#333333',
  };

  // HTML document
  lines.push('<!DOCTYPE html>');
  lines.push('<html lang="pt-BR">');
  lines.push('<head>');
  lines.push('  <meta charset="UTF-8">');
  lines.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
  lines.push(`  <title>${escapeHTML(plan.title)}</title>`);
  lines.push(`  <meta name="description" content="${escapeHTML(plan.metaDescription)}">`);
  lines.push(`  <meta name="keywords" content="${plan.keywords.join(', ')}">`);
  lines.push('  <style>');
  lines.push(`    :root {`);
  lines.push(`      --color-primary: ${colors.primary};`);
  lines.push(`      --color-secondary: ${colors.secondary};`);
  lines.push(`      --color-accent: ${colors.accent};`);
  lines.push(`      --color-bg: ${colors.background};`);
  lines.push(`      --color-text: ${colors.text};`);
  lines.push(`    }`);
  lines.push(`    * { margin: 0; padding: 0; box-sizing: border-box; }`);
  lines.push(`    body { font-family: system-ui, sans-serif; color: var(--color-text); }`);
  lines.push(`    .section { padding: 4rem 2rem; }`);
  lines.push(`    .section--dark { background: var(--color-primary); color: #fff; }`);
  lines.push(`    .section--light { background: var(--color-bg); }`);
  lines.push(`    .section--accent { background: var(--color-accent); color: #fff; }`);
  lines.push(`    .container { max-width: 1200px; margin: 0 auto; }`);
  lines.push(`    h1, h2, h3 { margin-bottom: 1rem; }`);
  lines.push(`    .cta-button { display: inline-block; padding: 1rem 2rem; background: var(--color-accent); color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold; }`);
  lines.push(`    .content-points { list-style: none; padding: 0; }`);
  lines.push(`    .content-points li { padding: 0.5rem 0; }`);
  lines.push('  </style>');
  lines.push('</head>');
  lines.push('<body>');

  // Verify minimum sections
  if (plan.sections.length === 0) {
    warnings.push('Landing page sem seções');
  }

  const hasHero = plan.sections.some((s) => s.sectionType === LPSectionType.HERO);
  if (!hasHero) {
    warnings.push('Landing page sem hero section');
  }

  // Render sections
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

  // Heading
  if (section.heading) {
    const tag = section.sectionType === LPSectionType.HERO ? 'h1' : 'h2';
    lines.push(`    <${tag}>${escapeHTML(section.heading)}</${tag}>`);
  }

  // Subheading
  if (section.subheading) {
    lines.push(`    <p class="subheading">${escapeHTML(section.subheading)}</p>`);
  }

  // Hero image
  if (section.assetIds.length > 0 && section.sectionType === LPSectionType.HERO) {
    lines.push(`    <div class="hero-image">`);
    lines.push(`      <img src="{{asset:${section.assetIds[0]}}}" alt="${escapeHTML(section.heading ?? '')}">`);
    lines.push(`    </div>`);
  }

  // Gallery
  if (section.sectionType === LPSectionType.GALLERY && section.assetIds.length > 0) {
    lines.push('    <div class="gallery">');
    for (const assetId of section.assetIds) {
      lines.push(`      <img src="{{asset:${assetId}}}" alt="">`);
    }
    lines.push('    </div>');
  }

  // Content points
  if (section.contentPoints && section.contentPoints.length > 0) {
    lines.push('    <ul class="content-points">');
    for (const point of section.contentPoints) {
      lines.push(`      <li>${escapeHTML(point)}</li>`);
    }
    lines.push('    </ul>');
  }

  // Section assets (non-hero, non-gallery)
  if (section.assetIds.length > 0 &&
      section.sectionType !== LPSectionType.HERO &&
      section.sectionType !== LPSectionType.GALLERY) {
    lines.push(`    <div class="section-image">`);
    lines.push(`      <img src="{{asset:${section.assetIds[0]}}}" alt="${escapeHTML(section.heading ?? '')}">`);
    lines.push(`    </div>`);
  }

  // CTA button
  if (section.ctaText) {
    lines.push(`    <a href="#contato" class="cta-button">${escapeHTML(section.ctaText)}</a>`);
  }

  // Form (CTA_FORM)
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
