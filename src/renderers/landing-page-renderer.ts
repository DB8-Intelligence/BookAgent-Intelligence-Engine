/**
 * Landing Page Renderer — Renderização Rica de LandingPagePlan
 *
 * Transforma LandingPagePlan em HTML polido, responsivo e auto-contido.
 * Diferente do lp-exporter (serialização estrutural), este renderer:
 *
 * - Aplica CSS completo com design system responsivo
 * - Gera hero section com overlay gradient e CTA prominent
 * - Renderiza galeria com grid responsivo
 * - Cria formulário de captura funcional com validação HTML5
 * - Aplica animações de scroll suaves
 * - Personaliza com dados do corretor (logo, contato, CTA)
 * - Gera página 100% self-contained (inline CSS, sem dependências)
 */

import type { LandingPagePlan, LandingPageSection } from '../domain/entities/landing-page-plan.js';
import { LPSectionType } from '../domain/entities/landing-page-plan.js';
import type { PersonalizationProfile } from '../domain/entities/personalization.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface LandingPageRenderResult {
  html: string;
  sectionCount: number;
  hasForm: boolean;
  hasCTA: boolean;
  assetCount: number;
}

export function renderLandingPage(
  plan: LandingPagePlan,
  personalization?: PersonalizationProfile,
): LandingPageRenderResult {
  const assetIds = collectAssetIds(plan);
  const hasForm = plan.sections.some((s) => s.sectionType === LPSectionType.CTA_FORM);
  const hasCTA = plan.sections.some((s) => s.ctaText);

  return {
    html: renderHTML(plan, personalization),
    sectionCount: plan.sections.length,
    hasForm,
    hasCTA,
    assetCount: assetIds.size,
  };
}

// ---------------------------------------------------------------------------
// HTML Renderer
// ---------------------------------------------------------------------------

function renderHTML(plan: LandingPagePlan, personalization?: PersonalizationProfile): string {
  const colors = plan.brandColors ?? {
    primary: '#1a3a2a', secondary: '#2d5a3d', accent: '#c8a96e',
    background: '#f5f3ef', text: '#1a1a1a',
  };
  const contact = personalization?.contact;
  const cta = personalization?.cta;
  const branding = personalization?.branding;

  const sections = plan.sections
    .map((s) => renderSection(s, cta, contact))
    .join('\n');

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
  <meta property="og:type" content="website">
${plan.heroAssetId ? `  <meta property="og:image" content="{{asset:${plan.heroAssetId}}}">` : ''}
  <style>
${generateCSS(colors)}
  </style>
</head>
<body>
${branding?.hasLogo ? `  <div class="floating-logo floating-logo--${branding.logoPlacement}">
    <img src="${esc(branding.logoUrl ?? '')}" alt="${esc(branding.signature)}">
  </div>` : ''}

${sections}

  <script>
    /* Smooth scroll for anchor links */
    document.querySelectorAll('a[href^="#"]').forEach(function(a) {
      a.addEventListener('click', function(e) {
        e.preventDefault();
        var target = document.querySelector(this.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    /* Simple form handler */
    var form = document.querySelector('.lead-form');
    if (form) {
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        var data = Object.fromEntries(new FormData(this));
        console.log('Lead captured:', data);
        this.querySelector('.form-success').style.display = 'block';
        this.querySelector('.form-fields').style.display = 'none';
      });
    }
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Section Renderers
// ---------------------------------------------------------------------------

function renderSection(
  section: LandingPageSection,
  cta?: { primaryText: string; secondaryText: string; whatsappLink?: string },
  contact?: { displayName: string; region?: string; channels: Array<{ type: string; label: string; value: string; link?: string }> },
): string {
  switch (section.sectionType) {
    case LPSectionType.HERO:
      return renderHero(section, cta);
    case LPSectionType.GALLERY:
      return renderGallery(section);
    case LPSectionType.CTA_FORM:
      return renderFormSection(section, cta, contact);
    case LPSectionType.FOOTER:
      return renderFooter(section, contact);
    default:
      return renderContentSection(section, cta);
  }
}

function renderHero(section: LandingPageSection, cta?: { primaryText: string; whatsappLink?: string }): string {
  const bgImage = section.assetIds.length > 0 ? `{{asset:${section.assetIds[0]}}}` : '';
  const ctaHref = cta?.whatsappLink ?? '#contato';
  const ctaText = section.ctaText ?? cta?.primaryText ?? 'Saiba Mais';

  return `  <section class="lp-section lp-hero" data-role="${section.conversionRole}">
    <div class="hero-bg" style="background-image: url('${bgImage}')"></div>
    <div class="hero-overlay"></div>
    <div class="hero-content container">
      <h1 class="hero-title">${esc(section.heading)}</h1>
${section.subheading ? `      <p class="hero-subtitle">${esc(section.subheading)}</p>` : ''}
${section.contentPoints.length > 0 ? `      <ul class="hero-highlights">
${section.contentPoints.slice(0, 4).map((p) => `        <li>${esc(p)}</li>`).join('\n')}
      </ul>` : ''}
      <a href="${esc(ctaHref)}" class="btn btn-primary btn-lg">${esc(ctaText)}</a>
    </div>
  </section>`;
}

function renderGallery(section: LandingPageSection): string {
  if (section.assetIds.length === 0) return renderContentSection(section);

  return `  <section class="lp-section lp-gallery" data-role="${section.conversionRole}">
    <div class="container">
      <h2 class="section-title">${esc(section.heading)}</h2>
${section.subheading ? `      <p class="section-subtitle">${esc(section.subheading)}</p>` : ''}
      <div class="gallery-grid gallery-grid--${Math.min(section.assetIds.length, 4)}">
${section.assetIds.map((id) => `        <figure class="gallery-item">
          <img src="{{asset:${id}}}" alt="" loading="lazy">
        </figure>`).join('\n')}
      </div>
${renderContentPoints(section.contentPoints)}
    </div>
  </section>`;
}

function renderFormSection(
  section: LandingPageSection,
  cta?: { primaryText: string; secondaryText: string; whatsappLink?: string },
  contact?: { displayName: string; channels: Array<{ type: string; label: string; value: string; link?: string }> },
): string {
  const submitText = section.ctaText ?? cta?.primaryText ?? 'Enviar';
  const fields = section.contentPoints.length > 0
    ? section.contentPoints
    : ['Nome completo', 'WhatsApp', 'E-mail'];

  return `  <section class="lp-section lp-form" id="contato" data-role="${section.conversionRole}">
    <div class="container">
      <div class="form-wrapper">
        <div class="form-header">
          <h2 class="section-title">${esc(section.heading)}</h2>
${section.subheading ? `          <p class="section-subtitle">${esc(section.subheading)}</p>` : ''}
${section.assetIds.length > 0 ? `          <div class="form-image">
            <img src="{{asset:${section.assetIds[0]}}}" alt="${esc(section.heading)}" loading="lazy">
          </div>` : ''}
        </div>
        <form class="lead-form" action="#" method="POST">
          <div class="form-fields">
${fields.map((field) => {
    const id = slugify(field);
    const type = inferInputType(field);
    return `            <div class="form-group">
              <label for="${id}">${esc(field)}</label>
              <input type="${type}" id="${id}" name="${id}" placeholder="${esc(field)}" required>
            </div>`;
  }).join('\n')}
            <button type="submit" class="btn btn-primary btn-block">${esc(submitText)}</button>
          </div>
          <div class="form-success" style="display:none">
            <p>Obrigado! Entraremos em contato em breve.</p>
          </div>
        </form>
${contact ? `        <div class="form-contact">
${contact.channels.map((ch) => {
    const tag = ch.link ? 'a' : 'span';
    const attrs = ch.link ? ` href="${esc(ch.link)}" target="_blank" rel="noopener"` : '';
    return `          <${tag} class="contact-item contact-item--${ch.type}"${attrs}>${esc(ch.label)}: ${esc(ch.value)}</${tag}>`;
  }).join('\n')}
        </div>` : ''}
      </div>
    </div>
  </section>`;
}

function renderFooter(
  section: LandingPageSection,
  contact?: { displayName: string; region?: string; channels: Array<{ type: string; label: string; value: string; link?: string }> },
): string {
  return `  <footer class="lp-section lp-footer" data-role="${section.conversionRole}">
    <div class="container">
      <div class="footer-content">
        <h3 class="footer-name">${esc(contact?.displayName ?? section.heading)}</h3>
${contact?.region || section.subheading ? `        <p class="footer-region">${esc(contact?.region ?? section.subheading)}</p>` : ''}
${contact ? `        <div class="footer-channels">
${contact.channels.map((ch) => {
    const tag = ch.link ? 'a' : 'span';
    const attrs = ch.link ? ` href="${esc(ch.link)}" target="_blank" rel="noopener"` : '';
    return `          <${tag} class="footer-channel"${attrs}>${esc(ch.label)}: ${esc(ch.value)}</${tag}>`;
  }).join('\n')}
        </div>` : `${renderContentPoints(section.contentPoints)}`}
${section.ctaText ? `        <a href="#contato" class="btn btn-accent">${esc(section.ctaText)}</a>` : ''}
      </div>
      <div class="footer-legal">
        <p>Imagens meramente ilustrativas. Sujeito a disponibilidade.</p>
      </div>
    </div>
  </footer>`;
}

function renderContentSection(
  section: LandingPageSection,
  cta?: { primaryText: string; whatsappLink?: string },
): string {
  const bgClass = section.backgroundType === 'image'
    ? 'lp-section--dark'
    : section.backgroundType === 'gradient'
      ? 'lp-section--accent'
      : 'lp-section--light';

  return `  <section class="lp-section ${bgClass}" data-type="${section.sectionType}" data-role="${section.conversionRole}">
    <div class="container">
      <h2 class="section-title">${esc(section.heading)}</h2>
${section.subheading && section.subheading !== section.heading ? `      <p class="section-subtitle">${esc(section.subheading)}</p>` : ''}
${section.assetIds.length > 0 ? `      <div class="section-media">
        <img src="{{asset:${section.assetIds[0]}}}" alt="${esc(section.heading)}" loading="lazy">
      </div>` : ''}
${renderContentPoints(section.contentPoints)}
${section.ctaText ? `      <a href="${cta?.whatsappLink ?? '#contato'}" class="btn btn-primary">${esc(section.ctaText)}</a>` : ''}
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderContentPoints(points: string[]): string {
  if (!points || points.length === 0) return '';

  // Separate bullet items from regular text
  const bullets = points.filter((p) => p.startsWith('•') || p.startsWith('-'));
  const text = points.filter((p) => !p.startsWith('•') && !p.startsWith('-'));

  const lines: string[] = [];

  if (text.length > 0) {
    lines.push('      <div class="content-text">');
    for (const t of text) {
      lines.push(`        <p>${esc(t)}</p>`);
    }
    lines.push('      </div>');
  }

  if (bullets.length > 0) {
    lines.push('      <ul class="feature-list">');
    for (const b of bullets) {
      lines.push(`        <li>${esc(b.replace(/^[•\-]\s*/, ''))}</li>`);
    }
    lines.push('      </ul>');
  }

  return lines.join('\n');
}

function inferInputType(field: string): string {
  const lower = field.toLowerCase();
  if (lower.includes('email') || lower.includes('e-mail')) return 'email';
  if (lower.includes('telefone') || lower.includes('whatsapp') || lower.includes('celular')) return 'tel';
  return 'text';
}

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

function collectAssetIds(plan: LandingPagePlan): Set<string> {
  const ids = new Set<string>();
  if (plan.heroAssetId) ids.add(plan.heroAssetId);
  for (const section of plan.sections) {
    for (const id of section.assetIds) ids.add(id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// CSS — Complete Design System
// ---------------------------------------------------------------------------

function generateCSS(colors: { primary: string; secondary: string; accent: string; background: string; text: string }): string {
  return `    /* === Landing Page — BookAgent Renderer === */
    :root {
      --lp-primary: ${colors.primary};
      --lp-secondary: ${colors.secondary};
      --lp-accent: ${colors.accent};
      --lp-bg: ${colors.background};
      --lp-text: ${colors.text};
      --lp-font-heading: 'Georgia', 'Playfair Display', serif;
      --lp-font-body: 'Segoe UI', system-ui, -apple-system, sans-serif;
      --lp-radius: 8px;
      --lp-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--lp-font-body);
      color: var(--lp-text);
      background: var(--lp-bg);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem; }
    img { max-width: 100%; height: auto; }

    /* Buttons */
    .btn {
      display: inline-block;
      padding: 0.9rem 2.2rem;
      font-size: 1rem;
      font-weight: 700;
      text-decoration: none;
      border-radius: var(--lp-radius);
      border: none;
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
      text-align: center;
    }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
    .btn-primary { background: var(--lp-accent); color: #fff; }
    .btn-accent { background: var(--lp-primary); color: #fff; }
    .btn-lg { font-size: 1.1rem; padding: 1.1rem 2.8rem; }
    .btn-block { display: block; width: 100%; }

    /* Section base */
    .lp-section { padding: 5rem 0; }
    .lp-section--dark { background: var(--lp-primary); color: #fff; }
    .lp-section--light { background: var(--lp-bg); }
    .lp-section--accent { background: var(--lp-accent); color: #fff; }
    .section-title {
      font-family: var(--lp-font-heading);
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      line-height: 1.25;
    }
    .section-subtitle {
      font-size: 1.1rem;
      opacity: 0.85;
      margin-bottom: 2rem;
      max-width: 600px;
    }

    /* Hero */
    .lp-hero {
      position: relative;
      min-height: 85vh;
      display: flex;
      align-items: center;
      padding: 0;
      overflow: hidden;
    }
    .hero-bg {
      position: absolute; inset: 0;
      background-size: cover;
      background-position: center;
      z-index: 0;
    }
    .hero-overlay {
      position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%);
      z-index: 1;
    }
    .hero-content {
      position: relative; z-index: 2;
      color: #fff;
      padding: 4rem 1.5rem;
    }
    .hero-title {
      font-family: var(--lp-font-heading);
      font-size: 3rem;
      font-weight: 800;
      line-height: 1.15;
      margin-bottom: 1rem;
      max-width: 700px;
    }
    .hero-subtitle {
      font-size: 1.25rem;
      opacity: 0.9;
      margin-bottom: 1.5rem;
      max-width: 550px;
    }
    .hero-highlights {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-bottom: 2rem;
    }
    .hero-highlights li {
      background: rgba(255,255,255,0.15);
      backdrop-filter: blur(4px);
      padding: 0.5rem 1.25rem;
      border-radius: 100px;
      font-size: 0.95rem;
      font-weight: 500;
    }

    /* Content sections */
    .section-media {
      margin: 2rem 0;
      border-radius: var(--lp-radius);
      overflow: hidden;
      box-shadow: var(--lp-shadow);
    }
    .section-media img { display: block; width: 100%; }
    .content-text p {
      margin-bottom: 0.75rem;
      font-size: 1.05rem;
      line-height: 1.7;
    }
    .feature-list {
      list-style: none;
      margin: 1.5rem 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 0.75rem;
    }
    .feature-list li {
      position: relative;
      padding: 0.6rem 0 0.6rem 1.5rem;
      font-size: 1rem;
    }
    .feature-list li::before {
      content: '';
      position: absolute;
      left: 0; top: 1rem;
      width: 8px; height: 8px;
      background: var(--lp-accent);
      border-radius: 50%;
    }
    .lp-section--dark .feature-list li::before,
    .lp-section--accent .feature-list li::before { background: #fff; }

    /* Gallery */
    .gallery-grid {
      display: grid;
      gap: 1rem;
      margin: 2rem 0;
    }
    .gallery-grid--1 { grid-template-columns: 1fr; }
    .gallery-grid--2 { grid-template-columns: repeat(2, 1fr); }
    .gallery-grid--3 { grid-template-columns: repeat(3, 1fr); }
    .gallery-grid--4 { grid-template-columns: repeat(2, 1fr); }
    .gallery-item {
      border-radius: var(--lp-radius);
      overflow: hidden;
      box-shadow: var(--lp-shadow);
    }
    .gallery-item img {
      width: 100%;
      height: 280px;
      object-fit: cover;
      display: block;
      transition: transform 0.3s;
    }
    .gallery-item:hover img { transform: scale(1.03); }

    /* Form section */
    .lp-form {
      background: linear-gradient(135deg, var(--lp-primary) 0%, var(--lp-secondary) 100%);
      color: #fff;
    }
    .form-wrapper {
      max-width: 560px;
      margin: 0 auto;
      text-align: center;
    }
    .form-header { margin-bottom: 2rem; }
    .form-image {
      margin: 1.5rem 0;
      border-radius: var(--lp-radius);
      overflow: hidden;
    }
    .lead-form { text-align: left; }
    .form-group {
      margin-bottom: 1.25rem;
    }
    .form-group label {
      display: block;
      font-size: 0.9rem;
      font-weight: 600;
      margin-bottom: 0.4rem;
      opacity: 0.9;
    }
    .form-group input {
      width: 100%;
      padding: 0.85rem 1rem;
      font-size: 1rem;
      border: 2px solid rgba(255,255,255,0.2);
      border-radius: var(--lp-radius);
      background: rgba(255,255,255,0.1);
      color: #fff;
      transition: border-color 0.2s;
    }
    .form-group input::placeholder { color: rgba(255,255,255,0.5); }
    .form-group input:focus {
      outline: none;
      border-color: var(--lp-accent);
      background: rgba(255,255,255,0.15);
    }
    .form-success {
      padding: 2rem;
      text-align: center;
      font-size: 1.1rem;
    }
    .form-contact {
      margin-top: 1.5rem;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 1rem;
      font-size: 0.9rem;
      opacity: 0.8;
    }
    .contact-item { color: #fff; text-decoration: none; }
    .contact-item:hover { text-decoration: underline; }

    /* Footer */
    .lp-footer {
      background: var(--lp-primary);
      color: #fff;
      padding: 3rem 0 2rem;
      text-align: center;
    }
    .footer-name {
      font-family: var(--lp-font-heading);
      font-size: 1.5rem;
      margin-bottom: 0.25rem;
    }
    .footer-region {
      opacity: 0.7;
      margin-bottom: 1rem;
    }
    .footer-channels {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 1.25rem;
      margin-bottom: 1.5rem;
    }
    .footer-channel { color: #fff; text-decoration: none; opacity: 0.8; }
    .footer-channel:hover { opacity: 1; text-decoration: underline; }
    .footer-legal {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid rgba(255,255,255,0.1);
      font-size: 0.8rem;
      opacity: 0.5;
    }

    /* Floating logo */
    .floating-logo {
      position: fixed;
      z-index: 100;
      width: 60px;
      height: 60px;
    }
    .floating-logo img { width: 100%; height: 100%; object-fit: contain; }
    .floating-logo--bottom-right { bottom: 1.5rem; right: 1.5rem; }
    .floating-logo--bottom-left { bottom: 1.5rem; left: 1.5rem; }
    .floating-logo--top-right { top: 1.5rem; right: 1.5rem; }
    .floating-logo--top-left { top: 1.5rem; left: 1.5rem; }

    /* Responsive */
    @media (max-width: 768px) {
      .hero-title { font-size: 2rem; }
      .hero-subtitle { font-size: 1.05rem; }
      .lp-section { padding: 3.5rem 0; }
      .section-title { font-size: 1.5rem; }
      .gallery-grid--2, .gallery-grid--3, .gallery-grid--4 { grid-template-columns: 1fr; }
      .gallery-item img { height: 220px; }
      .hero-highlights { flex-direction: column; }
      .feature-list { grid-template-columns: 1fr; }
    }`;
}
