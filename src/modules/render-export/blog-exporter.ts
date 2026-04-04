/**
 * Blog Exporter
 *
 * Serializa BlogPlan[] em ExportArtifact[] nos formatos:
 * - HTML (artigo completo pronto para publicação — texto expandido quando AI disponível)
 * - Markdown (para CMS como WordPress, Ghost, Notion)
 * - JSON (dados estruturados para renderização custom)
 *
 * Quando um AITextService é fornecido, os artefatos HTML e Markdown
 * contêm texto corrido final gerado por IA (ou localmente com fallback).
 * O JSON sempre serializa o plano estrutural bruto.
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
import type { AITextService } from '../../services/ai-text-service.js';
import type { GeneratedBlogArticle, GeneratedBlogSection } from '../../generation/types.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Exporta BlogPlans como artefatos de blog.
 * Para cada BlogPlan gera:
 * 1. HTML (artigo completo — enriquecido com AI quando disponível)
 * 2. Markdown (para CMS — enriquecido com AI quando disponível)
 * 3. JSON (dados estruturados do plano)
 *
 * @param plans - BlogPlans gerados pelo pipeline
 * @param aiService - AITextService opcional; quando fornecido, ativa geração com IA
 */
export async function exportBlogPlans(
  plans: BlogPlan[],
  aiService?: AITextService | null,
): Promise<ExportArtifact[]> {
  const artifacts: ExportArtifact[] = [];

  for (const plan of plans) {
    // Gerar texto do artigo (AI ou local)
    let article: GeneratedBlogArticle | null = null;
    if (aiService) {
      try {
        article = await aiService.generateBlog(plan);
      } catch (err) {
        logger.warn(`[BlogExporter] Text generation failed for "${plan.title}": ${err}`);
      }
    }

    artifacts.push(buildHTMLArtifact(plan, article));
    artifacts.push(buildMarkdownArtifact(plan, article));
    artifacts.push(buildJSONArtifact(plan));
  }

  return artifacts;
}

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

function buildHTMLArtifact(plan: BlogPlan, article: GeneratedBlogArticle | null): ExportArtifact {
  const warnings: string[] = [];
  const html = article
    ? renderEnrichedBlogHTML(plan, article, warnings)
    : renderBlogHTML(plan, warnings);

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

/** HTML com texto expandido gerado por IA (V2) */
function renderEnrichedBlogHTML(
  plan: BlogPlan,
  article: GeneratedBlogArticle,
  warnings: string[],
): string {
  const lines: string[] = [];

  lines.push('<!DOCTYPE html>');
  lines.push('<html lang="pt-BR">');
  lines.push('<head>');
  lines.push('  <meta charset="UTF-8">');
  lines.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
  lines.push(`  <title>${escapeHTML(article.title)}</title>`);
  lines.push(`  <meta name="description" content="${escapeHTML(article.metaDescription)}">`);
  lines.push(`  <meta name="keywords" content="${article.keywords.join(', ')}">`);
  lines.push('</head>');
  lines.push('<body>');
  lines.push('<article>');

  // Hero image
  if (plan.heroAssetId) {
    lines.push('  <figure class="hero-image">');
    lines.push(`    <img src="{{asset:${plan.heroAssetId}}}" alt="${escapeHTML(article.title)}">`);
    lines.push('  </figure>');
  }

  // Title
  lines.push(`  <h1>${escapeHTML(article.title)}</h1>`);

  // Introduction (expanded text)
  if (article.introduction) {
    lines.push('  <div class="introduction">');
    for (const para of article.introduction.split('\n\n').filter(Boolean)) {
      lines.push(`    <p>${escapeHTML(para.trim())}</p>`);
    }
    lines.push('  </div>');
  } else {
    warnings.push('Artigo sem introdução');
  }

  // Sections (with flowing paragraphs)
  for (let i = 0; i < article.sections.length; i++) {
    const section = article.sections[i];
    const planSection = plan.sections[i];
    lines.push(renderEnrichedSectionHTML(section, planSection));
  }

  // Conclusion
  if (article.conclusion) {
    lines.push('  <div class="conclusion">');
    lines.push('    <h2>Conclusão</h2>');
    for (const para of article.conclusion.split('\n\n').filter(Boolean)) {
      lines.push(`    <p>${escapeHTML(para.trim())}</p>`);
    }
    lines.push('  </div>');
  }

  // CTA
  if (article.ctaText) {
    lines.push('  <div class="cta">');
    lines.push(`    <p class="cta-text">${escapeHTML(article.ctaText)}</p>`);
    lines.push('  </div>');
  }

  lines.push('</article>');
  lines.push('</body>');
  lines.push('</html>');

  return lines.join('\n');
}

function renderEnrichedSectionHTML(
  section: GeneratedBlogSection,
  planSection?: BlogSection,
): string {
  const lines: string[] = [];

  lines.push(`  <section class="section section--${section.editorialRole}">`);
  lines.push(`    <h2>${escapeHTML(section.heading)}</h2>`);

  // Asset da seção
  if (section.assetIds.length > 0) {
    lines.push('    <figure>');
    lines.push(`      <img src="{{asset:${section.assetIds[0]}}}" alt="${escapeHTML(section.heading)}">`);
    lines.push('    </figure>');
  } else if (planSection?.assetIds?.length) {
    lines.push('    <figure>');
    lines.push(`      <img src="{{asset:${planSection.assetIds[0]}}}" alt="${escapeHTML(section.heading)}">`);
    lines.push('    </figure>');
  }

  // Parágrafos fluidos gerados por IA
  for (const paragraph of section.paragraphs) {
    if (paragraph.trim()) {
      lines.push(`    <p>${escapeHTML(paragraph.trim())}</p>`);
    }
  }

  lines.push('  </section>');
  return lines.join('\n');
}

/** HTML com dados brutos do plano (V1 — fallback) */
function renderBlogHTML(plan: BlogPlan, warnings: string[]): string {
  const lines: string[] = [];

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

  if (plan.heroAssetId) {
    lines.push(`  <figure class="hero-image">`);
    lines.push(`    <img src="{{asset:${plan.heroAssetId}}}" alt="${escapeHTML(plan.title)}">`);
    lines.push(`  </figure>`);
  }

  lines.push(`  <h1>${escapeHTML(plan.title)}</h1>`);

  if (plan.introduction) {
    lines.push(`  <div class="introduction">`);
    lines.push(`    <p>${escapeHTML(plan.introduction)}</p>`);
    lines.push(`  </div>`);
  } else {
    warnings.push('Artigo sem introdução');
  }

  for (const section of plan.sections) {
    lines.push(renderSectionHTML(section));
  }

  if (plan.conclusion) {
    lines.push(`  <div class="conclusion">`);
    lines.push(`    <h2>Conclusão</h2>`);
    lines.push(`    <p>${escapeHTML(plan.conclusion)}</p>`);
    lines.push(`  </div>`);
  }

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

  if (section.assetIds.length > 0) {
    lines.push(`    <figure>`);
    lines.push(`      <img src="{{asset:${section.assetIds[0]}}}" alt="${escapeHTML(section.heading)}">`);
    lines.push(`    </figure>`);
  }

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

function buildMarkdownArtifact(plan: BlogPlan, article: GeneratedBlogArticle | null): ExportArtifact {
  const warnings: string[] = [];
  const md = article
    ? renderEnrichedBlogMarkdown(plan, article, warnings)
    : renderBlogMarkdown(plan, warnings);

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

/** Markdown com texto expandido gerado por IA (V2) */
function renderEnrichedBlogMarkdown(
  plan: BlogPlan,
  article: GeneratedBlogArticle,
  _warnings: string[],
): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`title: "${article.title}"`);
  lines.push(`slug: "${article.slug}"`);
  lines.push(`description: "${article.metaDescription}"`);
  lines.push(`keywords: [${article.keywords.map((k) => `"${k}"`).join(', ')}]`);
  if (plan.heroAssetId) {
    lines.push(`heroImage: "{{asset:${plan.heroAssetId}}}"`);
  }
  lines.push('---');
  lines.push('');

  lines.push(`# ${article.title}`);
  lines.push('');

  if (plan.heroAssetId) {
    lines.push(`![${article.title}]({{asset:${plan.heroAssetId}}})`);
    lines.push('');
  }

  // Introduction
  if (article.introduction) {
    lines.push(article.introduction.trim());
    lines.push('');
  }

  // Sections
  for (let i = 0; i < article.sections.length; i++) {
    const section = article.sections[i];
    const planSection = plan.sections[i];

    lines.push(`## ${section.heading}`);
    lines.push('');

    const assetId = section.assetIds[0] ?? planSection?.assetIds?.[0];
    if (assetId) {
      lines.push(`![${section.heading}]({{asset:${assetId}}})`);
      lines.push('');
    }

    for (const paragraph of section.paragraphs) {
      if (paragraph.trim()) {
        lines.push(paragraph.trim());
        lines.push('');
      }
    }
  }

  // Conclusion
  if (article.conclusion) {
    lines.push('## Conclusão');
    lines.push('');
    lines.push(article.conclusion.trim());
    lines.push('');
  }

  // CTA
  if (article.ctaText) {
    lines.push('---');
    lines.push('');
    lines.push(`**${article.ctaText.trim()}**`);
    lines.push('');
  }

  return lines.join('\n');
}

/** Markdown com dados brutos do plano (V1 — fallback) */
function renderBlogMarkdown(plan: BlogPlan, warnings: string[]): string {
  const lines: string[] = [];

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

  lines.push(`# ${plan.title}`);
  lines.push('');

  if (plan.heroAssetId) {
    lines.push(`![${plan.title}]({{asset:${plan.heroAssetId}}})`);
    lines.push('');
  }

  if (plan.introduction) {
    lines.push(plan.introduction);
    lines.push('');
  } else {
    warnings.push('Artigo sem introdução');
  }

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

  if (plan.conclusion) {
    lines.push('## Conclusão');
    lines.push('');
    lines.push(plan.conclusion);
    lines.push('');
  }

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
