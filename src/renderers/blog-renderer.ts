/**
 * Blog Renderer — Renderização Rica de BlogPlan
 *
 * Transforma BlogPlan em HTML/Markdown polidos e prontos para publicação.
 * Diferente do blog-exporter (que serializa draft points crus), este renderer:
 *
 * - Expande draft points em parágrafos fluidos de prosa
 * - Aplica CSS editorial completo (tipografia, espaçamento, responsividade)
 * - Gera estrutura semântica rica (article, figure, figcaption, aside)
 * - Adiciona microdata/schema.org para SEO
 * - Formata listas, bullet points e dados numéricos
 * - Insere separadores visuais entre seções
 */

import type { BlogPlan, BlogSection } from '../domain/entities/blog-plan.js';
import type { PersonalizationProfile } from '../domain/entities/personalization.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BlogRenderResult {
  html: string;
  markdown: string;
  wordCount: number;
  sectionCount: number;
  assetCount: number;
}

export function renderBlog(
  plan: BlogPlan,
  personalization?: PersonalizationProfile,
): BlogRenderResult {
  const assetIds = collectAssetIds(plan);
  return {
    html: renderHTML(plan, personalization),
    markdown: renderMarkdown(plan, personalization),
    wordCount: estimateWordCount(plan),
    sectionCount: plan.sections.length,
    assetCount: assetIds.size,
  };
}

// ---------------------------------------------------------------------------
// HTML Renderer
// ---------------------------------------------------------------------------

function renderHTML(plan: BlogPlan, personalization?: PersonalizationProfile): string {
  const contact = personalization?.contact;
  const cta = personalization?.cta;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(plan.title)}</title>
  <meta name="description" content="${esc(plan.metaDescription)}">
  <meta name="keywords" content="${plan.keywords.join(', ')}">
  <meta property="og:title" content="${esc(plan.title)}">
  <meta property="og:description" content="${esc(plan.metaDescription)}">
  <meta property="og:type" content="article">
${plan.heroAssetId ? `  <meta property="og:image" content="{{asset:${plan.heroAssetId}}}">` : ''}
  <style>
${BLOG_CSS}
  </style>
</head>
<body>
  <article class="blog-article" itemscope itemtype="https://schema.org/Article">
${plan.heroAssetId ? `    <figure class="hero">
      <img src="{{asset:${plan.heroAssetId}}}" alt="${esc(plan.title)}" itemprop="image">
    </figure>` : ''}
    <header class="article-header">
      <h1 itemprop="headline">${esc(plan.title)}</h1>
${contact ? `      <div class="article-meta">
        <span class="author" itemprop="author">${esc(contact.displayName)}</span>
${contact.region ? `        <span class="region">${esc(contact.region)}</span>` : ''}
      </div>` : ''}
    </header>

    <div class="article-body" itemprop="articleBody">
${plan.introduction ? `      <div class="introduction lead">
        <p>${expandText(plan.introduction)}</p>
      </div>` : ''}

${plan.sections.map((s) => renderSectionHTML(s)).join('\n\n')}

${plan.conclusion ? `      <div class="conclusion">
        <h2>Conclusão</h2>
        <p>${expandText(plan.conclusion)}</p>
      </div>` : ''}
    </div>

${renderCTABlockHTML(plan, cta, contact)}
  </article>
</body>
</html>`;
}

function renderSectionHTML(section: BlogSection): string {
  const lines: string[] = [];

  lines.push(`      <section class="section section--${section.editorialRole}" id="${slugify(section.heading)}">`);
  lines.push(`        <h2>${esc(section.heading)}</h2>`);

  // Asset figure
  if (section.assetIds.length > 0) {
    lines.push(`        <figure class="section-figure">`);
    lines.push(`          <img src="{{asset:${section.assetIds[0]}}}" alt="${esc(section.heading)}" loading="lazy">`);
    lines.push(`        </figure>`);
  }

  // Expand draft points into prose paragraphs
  const prose = expandDraftPoints(section.draftPoints, section.seedText);
  for (const paragraph of prose) {
    if (isBulletList(paragraph)) {
      lines.push(`        <ul class="feature-list">`);
      for (const item of extractBulletItems(paragraph)) {
        lines.push(`          <li>${esc(item)}</li>`);
      }
      lines.push(`        </ul>`);
    } else {
      lines.push(`        <p>${expandText(paragraph)}</p>`);
    }
  }

  // Additional asset gallery
  if (section.assetIds.length > 1) {
    lines.push(`        <div class="section-gallery">`);
    for (const assetId of section.assetIds.slice(1)) {
      lines.push(`          <img src="{{asset:${assetId}}}" alt="" loading="lazy">`);
    }
    lines.push(`        </div>`);
  }

  lines.push(`      </section>`);
  return lines.join('\n');
}

function renderCTABlockHTML(
  plan: BlogPlan,
  cta?: { primaryText: string; secondaryText: string; whatsappLink?: string },
  contact?: { displayName: string; channels: Array<{ type: string; label: string; value: string; link?: string }> },
): string {
  if (!plan.ctaText && !cta) return '';

  const lines: string[] = [];
  lines.push(`    <aside class="cta-block">`);

  if (cta) {
    lines.push(`      <h3>${esc(cta.primaryText)}</h3>`);
    if (cta.secondaryText) {
      lines.push(`      <p class="cta-subtitle">${esc(cta.secondaryText)}</p>`);
    }
    if (cta.whatsappLink) {
      lines.push(`      <a href="${esc(cta.whatsappLink)}" class="cta-button cta-whatsapp" target="_blank" rel="noopener">${esc(cta.primaryText)}</a>`);
    }
  } else {
    lines.push(`      <p class="cta-text">${esc(plan.ctaText)}</p>`);
  }

  if (contact && contact.channels.length > 0) {
    lines.push(`      <div class="contact-channels">`);
    for (const ch of contact.channels) {
      const linkAttr = ch.link ? ` href="${esc(ch.link)}" target="_blank" rel="noopener"` : '';
      const tag = ch.link ? 'a' : 'span';
      lines.push(`        <${tag} class="channel channel--${ch.type}"${linkAttr}>${esc(ch.label)}: ${esc(ch.value)}</${tag}>`);
    }
    lines.push(`      </div>`);
  }

  lines.push(`    </aside>`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Markdown Renderer
// ---------------------------------------------------------------------------

function renderMarkdown(plan: BlogPlan, personalization?: PersonalizationProfile): string {
  const lines: string[] = [];
  const contact = personalization?.contact;
  const cta = personalization?.cta;

  // Frontmatter
  lines.push('---');
  lines.push(`title: "${plan.title}"`);
  lines.push(`slug: "${plan.slug}"`);
  lines.push(`description: "${plan.metaDescription}"`);
  lines.push(`keywords: [${plan.keywords.map((k) => `"${k}"`).join(', ')}]`);
  if (plan.heroAssetId) lines.push(`heroImage: "{{asset:${plan.heroAssetId}}}"`);
  if (contact) {
    lines.push(`author: "${contact.displayName}"`);
    if (contact.region) lines.push(`region: "${contact.region}"`);
  }
  lines.push('---');
  lines.push('');

  // Title & hero
  lines.push(`# ${plan.title}`);
  lines.push('');
  if (plan.heroAssetId) {
    lines.push(`![${plan.title}]({{asset:${plan.heroAssetId}}})`);
    lines.push('');
  }

  // Introduction
  if (plan.introduction) {
    lines.push(`> ${plan.introduction}`);
    lines.push('');
  }

  // Sections
  for (const section of plan.sections) {
    lines.push(`## ${section.heading}`);
    lines.push('');

    if (section.assetIds.length > 0) {
      lines.push(`![${section.heading}]({{asset:${section.assetIds[0]}}})`);
      lines.push('');
    }

    const prose = expandDraftPoints(section.draftPoints, section.seedText);
    for (const paragraph of prose) {
      if (isBulletList(paragraph)) {
        for (const item of extractBulletItems(paragraph)) {
          lines.push(`- ${item}`);
        }
        lines.push('');
      } else {
        lines.push(paragraph);
        lines.push('');
      }
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
  lines.push('---');
  lines.push('');
  if (cta) {
    lines.push(`### ${cta.primaryText}`);
    lines.push('');
    if (cta.secondaryText) lines.push(cta.secondaryText);
    if (cta.whatsappLink) lines.push(`[${cta.primaryText}](${cta.whatsappLink})`);
  } else if (plan.ctaText) {
    lines.push(`**${plan.ctaText}**`);
  }

  if (contact && contact.channels.length > 0) {
    lines.push('');
    for (const ch of contact.channels) {
      lines.push(`- **${ch.label}**: ${ch.link ? `[${ch.value}](${ch.link})` : ch.value}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Text expansion helpers
// ---------------------------------------------------------------------------

/**
 * Expands raw draft points into coherent paragraphs.
 * Groups related short points into flowing text, preserves
 * bullet-style items as lists.
 */
function expandDraftPoints(points: string[], seedText: string): string[] {
  if (points.length === 0 && seedText) return [seedText];
  if (points.length === 0) return [];

  const result: string[] = [];
  let currentParagraph: string[] = [];

  for (const point of points) {
    const trimmed = point.trim();
    if (!trimmed) continue;

    // Bullet items stay as a group
    if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
      // Flush accumulated paragraph
      if (currentParagraph.length > 0) {
        result.push(joinParagraph(currentParagraph));
        currentParagraph = [];
      }
      // Collect consecutive bullets
      result.push(trimmed);
      continue;
    }

    // Short fragments get merged into a paragraph
    if (trimmed.length < 80 && !trimmed.endsWith('.') && !trimmed.endsWith(':')) {
      currentParagraph.push(trimmed);
      // Flush if paragraph is getting long
      if (currentParagraph.join('. ').length > 200) {
        result.push(joinParagraph(currentParagraph));
        currentParagraph = [];
      }
    } else {
      // Flush accumulated
      if (currentParagraph.length > 0) {
        result.push(joinParagraph(currentParagraph));
        currentParagraph = [];
      }
      result.push(trimmed);
    }
  }

  // Flush remaining
  if (currentParagraph.length > 0) {
    result.push(joinParagraph(currentParagraph));
  }

  // Merge consecutive bullet lines into a single "list" paragraph
  return mergeBullets(result);
}

function joinParagraph(parts: string[]): string {
  return parts
    .map((p) => p.endsWith('.') || p.endsWith(':') || p.endsWith('!') || p.endsWith('?') ? p : `${p}.`)
    .join(' ');
}

function mergeBullets(items: string[]): string[] {
  const result: string[] = [];
  let bulletGroup: string[] = [];

  for (const item of items) {
    if (item.startsWith('•') || item.startsWith('-') || item.startsWith('*')) {
      bulletGroup.push(item);
    } else {
      if (bulletGroup.length > 0) {
        result.push(bulletGroup.join('\n'));
        bulletGroup = [];
      }
      result.push(item);
    }
  }
  if (bulletGroup.length > 0) {
    result.push(bulletGroup.join('\n'));
  }
  return result;
}

function isBulletList(text: string): boolean {
  const lines = text.split('\n');
  return lines.length > 0 && lines.every((l) =>
    l.trim().startsWith('•') || l.trim().startsWith('-') || l.trim().startsWith('*'),
  );
}

function extractBulletItems(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim().replace(/^[•\-*]\s*/, ''))
    .filter(Boolean);
}

function expandText(text: string): string {
  // Preserve line breaks that look intentional (after periods, before capitalized words)
  return esc(text).replace(/\n/g, '<br>');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function estimateWordCount(plan: BlogPlan): number {
  let count = 0;
  const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;
  if (plan.introduction) count += countWords(plan.introduction);
  if (plan.conclusion) count += countWords(plan.conclusion);
  for (const section of plan.sections) {
    count += countWords(section.heading);
    for (const p of section.draftPoints) count += countWords(p);
    if (section.seedText) count += countWords(section.seedText);
  }
  return count;
}

function collectAssetIds(plan: BlogPlan): Set<string> {
  const ids = new Set<string>();
  if (plan.heroAssetId) ids.add(plan.heroAssetId);
  for (const section of plan.sections) {
    for (const id of section.assetIds) ids.add(id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const BLOG_CSS = `    /* === Blog Article — BookAgent Renderer === */
    :root {
      --blog-font-heading: 'Georgia', 'Playfair Display', serif;
      --blog-font-body: 'Segoe UI', system-ui, -apple-system, sans-serif;
      --blog-max-width: 780px;
      --blog-color-text: #1a1a1a;
      --blog-color-muted: #666;
      --blog-color-accent: #c8a96e;
      --blog-color-bg: #fafaf8;
      --blog-color-border: #e8e4df;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--blog-font-body);
      color: var(--blog-color-text);
      background: var(--blog-color-bg);
      line-height: 1.75;
      font-size: 17px;
      -webkit-font-smoothing: antialiased;
    }
    .blog-article {
      max-width: var(--blog-max-width);
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
    }
    /* Hero */
    .hero {
      margin: -2rem -1.5rem 2rem;
      overflow: hidden;
      border-radius: 0 0 12px 12px;
    }
    .hero img {
      width: 100%;
      height: 420px;
      object-fit: cover;
      display: block;
    }
    /* Header */
    .article-header {
      margin-bottom: 2.5rem;
      padding-bottom: 1.5rem;
      border-bottom: 2px solid var(--blog-color-border);
    }
    .article-header h1 {
      font-family: var(--blog-font-heading);
      font-size: 2.2rem;
      font-weight: 700;
      line-height: 1.25;
      color: var(--blog-color-text);
      margin-bottom: 0.75rem;
    }
    .article-meta {
      display: flex;
      gap: 1rem;
      color: var(--blog-color-muted);
      font-size: 0.9rem;
    }
    .article-meta .author { font-weight: 600; }
    .article-meta .region::before { content: '·'; margin-right: 0.5rem; }
    /* Body */
    .article-body p {
      margin-bottom: 1.25rem;
    }
    .introduction.lead p {
      font-size: 1.15rem;
      color: var(--blog-color-muted);
      line-height: 1.8;
      border-left: 3px solid var(--blog-color-accent);
      padding-left: 1.25rem;
    }
    .article-body h2 {
      font-family: var(--blog-font-heading);
      font-size: 1.5rem;
      font-weight: 700;
      margin: 2.5rem 0 1rem;
      color: var(--blog-color-text);
    }
    .conclusion h2 {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 2px solid var(--blog-color-border);
    }
    /* Sections */
    .section {
      margin-bottom: 2rem;
    }
    .section-figure {
      margin: 1.25rem 0;
      border-radius: 8px;
      overflow: hidden;
    }
    .section-figure img {
      width: 100%;
      height: auto;
      display: block;
    }
    .section-gallery {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.75rem;
      margin: 1rem 0;
    }
    .section-gallery img {
      width: 100%;
      height: 180px;
      object-fit: cover;
      border-radius: 6px;
    }
    /* Feature lists */
    .feature-list {
      list-style: none;
      margin: 1rem 0 1.5rem;
      padding: 0;
    }
    .feature-list li {
      position: relative;
      padding: 0.4rem 0 0.4rem 1.5rem;
      line-height: 1.6;
    }
    .feature-list li::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0.85rem;
      width: 8px;
      height: 8px;
      background: var(--blog-color-accent);
      border-radius: 50%;
    }
    /* CTA Block */
    .cta-block {
      margin-top: 3rem;
      padding: 2rem;
      background: linear-gradient(135deg, #1a3a2a 0%, #2d5a3d 100%);
      color: #fff;
      border-radius: 12px;
      text-align: center;
    }
    .cta-block h3 {
      font-family: var(--blog-font-heading);
      font-size: 1.4rem;
      margin-bottom: 0.5rem;
    }
    .cta-subtitle { opacity: 0.85; margin-bottom: 1.25rem; }
    .cta-button {
      display: inline-block;
      padding: 0.85rem 2rem;
      background: var(--blog-color-accent);
      color: #fff;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 700;
      font-size: 1rem;
      transition: opacity 0.2s;
    }
    .cta-button:hover { opacity: 0.9; }
    .cta-whatsapp::before { content: '📱 '; }
    .contact-channels {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 1rem;
      margin-top: 1.25rem;
      font-size: 0.9rem;
      opacity: 0.85;
    }
    .channel { color: #fff; text-decoration: none; }
    .channel:hover { text-decoration: underline; }
    /* Responsive */
    @media (max-width: 600px) {
      .blog-article { padding: 1rem; }
      .article-header h1 { font-size: 1.6rem; }
      .hero { margin: -1rem -1rem 1.5rem; }
      .hero img { height: 260px; }
    }`;
