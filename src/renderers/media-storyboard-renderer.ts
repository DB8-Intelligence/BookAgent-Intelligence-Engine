/**
 * Media Storyboard Renderer — Visualização de MediaPlan
 *
 * Transforma MediaPlan em um storyboard HTML visual para inspeção humana.
 * Permite que o usuário veja a sequência de cenas, timing, overlays e
 * transições antes da renderização final de vídeo/imagem.
 *
 * Gera:
 * - Timeline visual com cards por cena
 * - Preview de layout e posicionamento de texto
 * - Indicadores de transição entre cenas
 * - Dados técnicos (resolução, aspect ratio, duração)
 * - Paleta de cores de branding por cena
 * - Status de prontidão para renderização
 */

import type { MediaPlan, MediaScene, TextOverlay } from '../domain/entities/media-plan.js';
import { RenderStatus } from '../domain/entities/media-plan.js';
import type { PersonalizationProfile } from '../domain/entities/personalization.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StoryboardRenderResult {
  html: string;
  sceneCount: number;
  totalDuration: number | null;
  renderStatus: string;
}

export function renderStoryboard(
  plan: MediaPlan,
  personalization?: PersonalizationProfile,
): StoryboardRenderResult {
  return {
    html: renderHTML(plan, personalization),
    sceneCount: plan.scenes.length,
    totalDuration: plan.totalDurationSeconds,
    renderStatus: plan.renderStatus,
  };
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function renderHTML(plan: MediaPlan, personalization?: PersonalizationProfile): string {
  const contact = personalization?.contact;
  const branding = personalization?.branding;
  const statusLabel = renderStatusLabel(plan.renderStatus);
  const [w, h] = plan.resolution ?? [1080, 1920];
  const isVertical = h > w;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Storyboard: ${esc(plan.title)}</title>
  <style>
${STORYBOARD_CSS}
  </style>
</head>
<body>
  <div class="storyboard">
    <header class="sb-header">
      <div class="sb-header-top">
        <h1>${esc(plan.title)}</h1>
        <span class="sb-status sb-status--${plan.renderStatus}">${statusLabel}</span>
      </div>
      <div class="sb-meta">
        <span class="sb-meta-item">
          <strong>Formato:</strong> ${esc(plan.format)}
        </span>
        <span class="sb-meta-item">
          <strong>Aspecto:</strong> ${esc(plan.aspectRatio?.label ?? (isVertical ? '9:16' : '16:9'))}
        </span>
        <span class="sb-meta-item">
          <strong>Resolução:</strong> ${w}×${h}
        </span>
${plan.totalDurationSeconds != null ? `        <span class="sb-meta-item">
          <strong>Duração:</strong> ${plan.totalDurationSeconds}s
        </span>` : ''}
${plan.totalSlides != null ? `        <span class="sb-meta-item">
          <strong>Slides:</strong> ${plan.totalSlides}
        </span>` : ''}
        <span class="sb-meta-item">
          <strong>Cenas:</strong> ${plan.scenes.length}
        </span>
      </div>
${contact ? `      <div class="sb-personalization">
        <strong>${esc(contact.displayName)}</strong>
${contact.region ? `        <span>${esc(contact.region)}</span>` : ''}
${branding?.hasLogo ? `        <span class="sb-logo-badge">Logo: ${esc(branding.logoPlacement)}</span>` : ''}
      </div>` : ''}
    </header>

    <div class="sb-timeline">
${plan.scenes.map((scene, i) => renderSceneCard(scene, i, plan.scenes.length, isVertical)).join('\n')}
    </div>

    <footer class="sb-footer">
      <div class="sb-color-palette">
        <strong>Paleta:</strong>
${extractPalette(plan).map((c) => `        <span class="sb-color-swatch" style="background:${c}" title="${c}"></span>`).join('\n')}
      </div>
      <p class="sb-generated">BookAgent Intelligence Engine — Storyboard Preview</p>
    </footer>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Scene Card
// ---------------------------------------------------------------------------

function renderSceneCard(scene: MediaScene, index: number, total: number, isVertical: boolean): string {
  const assetId = scene.assetIds[0] ?? null;
  const headlines = scene.textOverlays.filter((o) => o.role === 'headline');
  const bodies = scene.textOverlays.filter((o) => o.role === 'body');
  const captions = scene.textOverlays.filter((o) => o.role === 'caption');
  const ctas = scene.textOverlays.filter((o) => o.role === 'cta');
  const showTransition = index < total - 1;

  return `      <div class="sb-scene-wrapper">
        <div class="sb-scene" data-order="${scene.order}" data-role="${scene.role}">
          <div class="sb-scene-number">${index + 1}</div>
          <div class="sb-scene-preview sb-preview--${isVertical ? 'vertical' : 'horizontal'}" style="background-color: ${scene.branding.backgroundColor}">
${assetId ? `            <div class="sb-preview-asset">
              <img src="{{asset:${assetId}}}" alt="Cena ${index + 1}">
            </div>` : ''}
            <div class="sb-preview-overlays">
${renderOverlayPreview(headlines, 'headline')}
${renderOverlayPreview(bodies, 'body')}
${renderOverlayPreview(captions, 'caption')}
${renderOverlayPreview(ctas, 'cta')}
            </div>
          </div>
          <div class="sb-scene-info">
            <div class="sb-scene-role">${esc(scene.role)}</div>
${scene.durationSeconds != null ? `            <div class="sb-scene-duration">${scene.durationSeconds}s</div>` : ''}
            <div class="sb-scene-layout">${esc(scene.layoutHint)}</div>
            <div class="sb-scene-colors">
              <span class="sb-mini-swatch" style="background:${scene.branding.backgroundColor}" title="bg"></span>
              <span class="sb-mini-swatch" style="background:${scene.branding.textColor}" title="text"></span>
              <span class="sb-mini-swatch" style="background:${scene.branding.accentColor}" title="accent"></span>
            </div>
          </div>
          <div class="sb-scene-text">
${scene.textOverlays.map((o) => `            <div class="sb-overlay sb-overlay--${o.role} sb-overlay--${o.position}">
              <span class="sb-overlay-label">${o.role} (${o.position}, ${o.size})</span>
              <span class="sb-overlay-text">${esc(truncate(o.text, 120))}</span>
            </div>`).join('\n')}
          </div>
        </div>
${showTransition ? `        <div class="sb-transition">
          <span class="sb-transition-icon">→</span>
          <span class="sb-transition-type">${esc(scene.transition)}</span>
        </div>` : ''}
      </div>`;
}

function renderOverlayPreview(overlays: TextOverlay[], role: string): string {
  if (overlays.length === 0) return '';

  return overlays.map((o) => {
    const posClass = `sb-ov-${o.position}`;
    const sizeClass = `sb-ov-${o.size}`;
    return `              <div class="sb-ov ${posClass} ${sizeClass} sb-ov--${role}">${esc(truncate(o.text, 60))}</div>`;
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderStatusLabel(status: RenderStatus): string {
  switch (status) {
    case RenderStatus.READY: return 'Pronto';
    case RenderStatus.PARTIAL: return 'Parcial';
    case RenderStatus.NEEDS_ASSETS: return 'Faltam Assets';
    case RenderStatus.NEEDS_TEXT: return 'Faltam Textos';
    case RenderStatus.NOT_READY: return 'Não Pronto';
    default: return status;
  }
}

function extractPalette(plan: MediaPlan): string[] {
  const colors = new Set<string>();
  for (const scene of plan.scenes) {
    colors.add(scene.branding.backgroundColor);
    colors.add(scene.branding.textColor);
    colors.add(scene.branding.accentColor);
  }
  return Array.from(colors);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const STORYBOARD_CSS = `    /* === Storyboard — BookAgent Renderer === */
    :root {
      --sb-bg: #0f0f13;
      --sb-surface: #1a1a22;
      --sb-border: #2a2a35;
      --sb-text: #e0e0e8;
      --sb-muted: #888;
      --sb-accent: #c8a96e;
      --sb-green: #4caf50;
      --sb-yellow: #ff9800;
      --sb-red: #f44336;
      --sb-font: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: var(--sb-bg);
      color: var(--sb-text);
      line-height: 1.5;
    }
    .storyboard {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }

    /* Header */
    .sb-header {
      margin-bottom: 2.5rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--sb-border);
    }
    .sb-header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .sb-header h1 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #fff;
    }
    .sb-status {
      padding: 0.3rem 0.9rem;
      border-radius: 100px;
      font-size: 0.8rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .sb-status--ready { background: var(--sb-green); color: #fff; }
    .sb-status--partial { background: var(--sb-yellow); color: #000; }
    .sb-status--needs-assets, .sb-status--needs-text { background: var(--sb-yellow); color: #000; }
    .sb-status--not-ready { background: var(--sb-red); color: #fff; }
    .sb-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      font-size: 0.9rem;
      color: var(--sb-muted);
    }
    .sb-meta-item strong { color: var(--sb-text); }
    .sb-personalization {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      background: var(--sb-surface);
      border-radius: 6px;
      display: flex;
      gap: 1rem;
      align-items: center;
      font-size: 0.9rem;
    }
    .sb-logo-badge {
      background: var(--sb-accent);
      color: #000;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 700;
    }

    /* Timeline */
    .sb-timeline {
      display: flex;
      flex-direction: column;
      gap: 0;
    }
    .sb-scene-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    /* Scene Card */
    .sb-scene {
      background: var(--sb-surface);
      border: 1px solid var(--sb-border);
      border-radius: 12px;
      padding: 1.25rem;
      width: 100%;
      display: grid;
      grid-template-columns: auto 1fr;
      grid-template-rows: auto auto;
      gap: 1rem;
      position: relative;
    }
    .sb-scene-number {
      position: absolute;
      top: -10px;
      left: 16px;
      background: var(--sb-accent);
      color: #000;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 0.85rem;
    }

    /* Preview panel */
    .sb-scene-preview {
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .sb-preview--vertical {
      width: 120px;
      height: 213px; /* 9:16 ratio */
      grid-row: span 2;
    }
    .sb-preview--horizontal {
      width: 213px;
      height: 120px; /* 16:9 ratio */
      grid-row: span 2;
    }
    .sb-preview-asset {
      position: absolute; inset: 0;
    }
    .sb-preview-asset img {
      width: 100%; height: 100%;
      object-fit: cover;
    }
    .sb-preview-overlays {
      position: absolute; inset: 0;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 6px;
      pointer-events: none;
    }
    .sb-ov {
      background: rgba(0,0,0,0.6);
      color: #fff;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.55rem;
      line-height: 1.3;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sb-ov--headline { font-weight: 700; font-size: 0.65rem; }
    .sb-ov--cta { background: var(--sb-accent); color: #000; font-weight: 700; text-align: center; }
    .sb-ov-top { align-self: flex-start; }
    .sb-ov-center { align-self: center; }
    .sb-ov-bottom { align-self: flex-end; }
    .sb-ov-large { font-size: 0.7rem; }
    .sb-ov-small { font-size: 0.5rem; }

    /* Info strip */
    .sb-scene-info {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      font-size: 0.8rem;
    }
    .sb-scene-role {
      background: var(--sb-accent);
      color: #000;
      padding: 0.15rem 0.6rem;
      border-radius: 4px;
      font-weight: 700;
      font-size: 0.75rem;
      text-transform: uppercase;
    }
    .sb-scene-duration {
      font-family: var(--sb-font);
      color: var(--sb-accent);
      font-weight: 600;
    }
    .sb-scene-layout {
      color: var(--sb-muted);
      font-family: var(--sb-font);
      font-size: 0.75rem;
    }
    .sb-scene-colors {
      display: flex;
      gap: 4px;
    }
    .sb-mini-swatch {
      width: 14px; height: 14px;
      border-radius: 3px;
      border: 1px solid rgba(255,255,255,0.2);
    }

    /* Text details */
    .sb-scene-text {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .sb-overlay {
      padding: 0.5rem 0.75rem;
      background: rgba(255,255,255,0.04);
      border-radius: 6px;
      border-left: 3px solid var(--sb-border);
    }
    .sb-overlay--headline { border-left-color: var(--sb-accent); }
    .sb-overlay--cta { border-left-color: var(--sb-green); }
    .sb-overlay-label {
      display: block;
      font-size: 0.7rem;
      color: var(--sb-muted);
      font-family: var(--sb-font);
      margin-bottom: 0.2rem;
    }
    .sb-overlay-text {
      font-size: 0.85rem;
      line-height: 1.4;
    }

    /* Transition */
    .sb-transition {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0;
      color: var(--sb-muted);
      font-size: 0.8rem;
    }
    .sb-transition-icon {
      font-size: 1.2rem;
      transform: rotate(90deg);
      display: inline-block;
    }
    .sb-transition-type {
      font-family: var(--sb-font);
      font-size: 0.75rem;
      background: var(--sb-surface);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      border: 1px solid var(--sb-border);
    }

    /* Footer */
    .sb-footer {
      margin-top: 2.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--sb-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .sb-color-palette {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: var(--sb-muted);
    }
    .sb-color-swatch {
      width: 24px; height: 24px;
      border-radius: 4px;
      border: 1px solid rgba(255,255,255,0.15);
    }
    .sb-generated {
      font-size: 0.75rem;
      color: var(--sb-muted);
      opacity: 0.6;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .storyboard { padding: 1rem; }
      .sb-header h1 { font-size: 1.2rem; }
      .sb-scene {
        grid-template-columns: 1fr;
      }
      .sb-preview--vertical, .sb-preview--horizontal {
        width: 100%;
        height: 200px;
        grid-row: auto;
      }
      .sb-footer { flex-direction: column; gap: 1rem; }
    }`;
