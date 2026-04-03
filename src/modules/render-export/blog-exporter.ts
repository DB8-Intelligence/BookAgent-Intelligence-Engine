/**
 * Blog Exporter
 *
 * Serializa BlogPlan[] em ExportArtifact[] nos formatos:
 * - HTML (artigo completo pronto para publicação)
 * - Markdown (para CMS como WordPress, Ghost, Notion)
 * - JSON (dados estruturados para renderização custom)
 *
 * Gera artigos de blog com:
 * - Metadados SEO (title, description, keywords)
 * - Estrutura de headings (H1, H2, H3)
 * - Seções com conteúdo editorial
 * - CTA final personalizado
 * - Referências a assets (hero image, imagens por seção)
 */

import { v4 as uuid } from 'uuid';
import type { BlogPlan, BlogSection } from '../../domain/entities/blog-plan.js';
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
 * Exporta BlogPlans como artefatos de blog.
 * Para cada BlogPlan gera:
 * 1. HTML (artigo completo)
 * 2. Markdown (para CMS)
 * 3. JSON (dados estruturados)
 */
export function exportBlogPlans(plans: BlogPlan[]): ExportArtifact[] {
  const artifacts: ExportArtifact[] = [];

  for (const plan of plans) {
    artifacts.push(buildHTMLArtifact(plan));
    artifacts.push(buildMarkdownArtifact(plan));
    artifacts.push(buildJSONArtifact(plan));
  }

  return artifacts;
}

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

function buildHTMLArtifact(plan: BlogPlan): ExportArtifact {
  const warnings: string[] = [];
  const html = renderBlogHTML(plan, warnings);

  return {
    id: uuid(),
    artifactType: ArtifactType.BLOG_ARTICLE,
    exportFormat: ExportFormat.HTML,
    outputFormat: OutputFormat.BLOG,
    narrativeType: plan.narrativeType,
    planId: plan.id,
    title: plan.title,
    content: html,
    sizeBytes: Buffer.byteLength(html, 'utf-8'),
    filePath: `storage/outputs/blog/${plan.slug}.html`,
    status: warnings.length > 0 ? ArtifactStatus.PARTIAL : ArtifactStatus.VALID,
    warnings,
    referencedAssetIds: collectBlogAssetIds(plan),
    createdAt: new Date(),
  };
}

function renderBlogHTML(plan: BlogPlan, warnings: string[]): string {
  const lines: string[] = [];

  // HTML document
  lines.push('<!DOCTYPE html>');
  lines.push('<html lang="pt-BR">');
  lines.push('<head>');
  lines.push(`  <meta charset="UTF-8">`);
  lines.push(`  <meta name="viewport" content="width=device-width, initial-scale=1.0">`);
  lines.push(`  <title>${escapeHTML(plan.title)}</title>`);
  lines.push(`  <meta name="description" content="${escapeHTML(plan.metaDescription)}">`);
  lines.push(`  <meta name="keywords" content="${plan.keywords.join(', ')}">`);
  lines.push('</head>');
  lines.push('<body>');
  lines.push('<article>');

  // Hero image
  if (plan.heroAssetId) {
    lines.push(`  <figure class="hero-image">`);
    lines.push(`    <img src="{{asset:${plan.heroAssetId}}}" alt="${escapeHTML(plan.title)}">`);
    lines.push(`  </figure>`);
  }

  // Title
  lines.push(`  <h1>${escapeHTML(plan.title)}</h1>`);

  // Introduction
  if (plan.introduction) {
    lines.push(`  <div class="introduction">`);
    lines.push(`    <p>${escapeHTML(plan.introduction)}</p>`);
    lines.push(`  </div>`);
  } else {
    warnings.push('Artigo sem introdução');
  }

  // Sections
  for (const section of plan.sections) {
    lines.push(renderSectionHTML(section));
  }

  // Conclusion
  if (plan.conclusion) {
    lines.push(`  <div class="conclusion">`);
    lines.push(`    <h2>Conclusão</h2>`);
    lines.push(`    <p>${escapeHTML(plan.conclusion)}</p>`);
    lines.push(`  </div>`);
  }

  // CTA
  if (plan.ctaText) {
    lines.push(`  <div class="cta">`);
    lines.push(`    <p class="cta-text">${escapeHTML(plan.ctaText)}</p>`);
    lines.push(`  </div>`);
  }

  lines.push('</article>');
  lines.push('</body>');
  lines.push('</html>');

  return lines.join('\n');
}

function renderSectionHTML(section: BlogSection): string {
  const lines: string[] = [];

  lines.push(`  <section class="section section--${section.editorialRole}">`);
  lines.push(`    <h2>${escapeHTML(section.heading)}</h2>`);

  // Asset da seção
  if (section.assetIds.length > 0) {
    lines.push(`    <figure>`);
    lines.push(`      <img src="{{asset:${section.assetIds[0]}}}" alt="${escapeHTML(section.heading)}">`);
    lines.push(`    </figure>`);
  }

  // Draft points como parágrafos
  if (section.draftPoints.length > 0) {
    for (const point of section.draftPoints) {
      lines.push(`    <p>${escapeHTML(point)}</p>`);
    }
  } else if (section.seedText) {
    lines.push(`    <p>${escapeHTML(section.seedText)}</p>`);
  }

  lines.push(`  </section>`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Markdown builder
// ---------------------------------------------------------------------------

function buildMarkdownArtifact(plan: BlogPlan): ExportArtifact {
  const warnings: string[] = [];
  const md = renderBlogMarkdown(plan, warnings);

  return {
    id: uuid(),
    artifactType: ArtifactType.BLOG_ARTICLE,
    exportFormat: ExportFormat.MARKDOWN,
    outputFormat: OutputFormat.BLOG,
    narrativeType: plan.narrativeType,
    planId: plan.id,
    title: plan.title,
    content: md,
    sizeBytes: Buffer.byteLength(md, 'utf-8'),
    filePath: `storage/outputs/blog/${plan.slug}.md`,
    status: warnings.length > 0 ? ArtifactStatus.PARTIAL : ArtifactStatus.VALID,
    warnings,
    referencedAssetIds: collectBlogAssetIds(plan),
    createdAt: new Date(),
  };
}

function renderBlogMarkdown(plan: BlogPlan, warnings: string[]): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`title: "${plan.title}"`);
  lines.push(`slug: "${plan.slug}"`);
  lines.push(`description: "${plan.metaDescription}"`);
  lines.push(`keywords: [${plan.keywords.map((k) => `"${k}"`).join(', ')}]`);
  if (plan.heroAssetId) {
    lines.push(`heroImage: "{{asset:${plan.heroAssetId}}}"`);
  }
  lines.push('---');
  lines.push('');

  // Title
  lines.push(`# ${plan.title}`);
  lines.push('');

  // Hero image
  if (plan.heroAssetId) {
    lines.push(`![${plan.title}]({{asset:${plan.heroAssetId}}})`);
    lines.push('');
  }

  // Introduction
  if (plan.introduction) {
    lines.push(plan.introduction);
    lines.push('');
  } else {
    warnings.push('Artigo sem introdução');
  }

  // Sections
  for (const section of plan.sections) {
    lines.push(`## ${section.heading}`);
    lines.push('');

    if (section.assetIds.length > 0) {
      lines.push(`![${section.heading}]({{asset:${section.assetIds[0]}}})`);
      lines.push('');
    }

    if (section.draftPoints.length > 0) {
      for (const point of section.draftPoints) {
        lines.push(point);
        lines.push('');
      }
    } else if (section.seedText) {
      lines.push(section.seedText);
      lines.push('');
    }
  }

  // Conclusion
  if (plan.conclusion) {
    lines.push('## Conclusão');
    lines.push('');
    lines.push(plan.conclusion);
    lines.push('');
  }

  // CTA
  if (plan.ctaText) {
    lines.push('---');
    lines.push('');
    lines.push(`**${plan.ctaText}**`);
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// JSON builder
// ---------------------------------------------------------------------------

function buildJSONArtifact(plan: BlogPlan): ExportArtifact {
  const content = JSON.stringify({
    id: plan.id,
    title: plan.title,
    slug: plan.slug,
    metaDescription: plan.metaDescription,
    keywords: plan.keywords,
    heroAssetId: plan.heroAssetId,
    introduction: plan.introduction,
    sections: plan.sections.map((s) => ({
      heading: s.heading,
      editorialRole: s.editorialRole,
      draftPoints: s.draftPoints,
      seedText: s.seedText,
      assetIds: s.assetIds,
      estimatedWordCount: s.estimatedWordCount,
    })),
    conclusion: plan.conclusion,
    ctaText: plan.ctaText,
    estimatedWordCount: plan.estimatedWordCount,
    tone: plan.tone,
  }, null, 2);

  return {
    id: uuid(),
    artifactType: ArtifactType.BLOG_ARTICLE,
    exportFormat: ExportFormat.JSON,
    outputFormat: OutputFormat.BLOG,
    narrativeType: plan.narrativeType,
    planId: plan.id,
    title: plan.title,
    content,
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
    status: ArtifactStatus.VALID,
    warnings: [],
    referencedAssetIds: collectBlogAssetIds(plan),
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

function collectBlogAssetIds(plan: BlogPlan): string[] {
  const ids = new Set<string>();
  if (plan.heroAssetId) ids.add(plan.heroAssetId);
  for (const section of plan.sections) {
    for (const id of section.assetIds) {
      ids.add(id);
    }
  }
  return Array.from(ids);
}
