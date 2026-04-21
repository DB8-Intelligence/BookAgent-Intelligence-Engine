/**
 * Shotstack Render Adapter — BookAgent Intelligence Engine
 *
 * Substitui FFmpeg local pelo Shotstack cloud render API.
 * Mantém exatamente a mesma interface de renderFromSpec().
 *
 * Fluxo:
 *   RenderSpec → buildShotstackEdit() → POST /render → poll até done → VideoRenderResult
 *
 * Variáveis de ambiente:
 *   SHOTSTACK_API_KEY   — API key do Shotstack
 *   SHOTSTACK_ENV       — "stage" (sandbox/free) | "v1" (production) — default: "stage"
 *
 * Docs: https://shotstack.io/docs/api/
 */

import { logger } from '../../utils/logger.js';
import type { RenderSpec, RenderSceneSpec } from '../../types/render-spec.js';
import type { VideoRenderResult } from './types.js';
import type { SpecRenderOptions } from './spec-renderer.js';

// ---------------------------------------------------------------------------
// Shotstack API Types
// ---------------------------------------------------------------------------

interface ShotstackClip {
  asset: ShotstackAsset;
  start: number;
  length: number | 'auto';
  effect?: string;
  transition?: { in?: string; out?: string };
  position?: string;
  offset?: { x: number; y: number };
  scale?: number;
}

interface ShotstackAsset {
  type: 'image' | 'video' | 'audio' | 'title' | 'html';
  src?: string;
  // title asset
  text?: string;
  style?: string;
  color?: string;
  size?: string;
  background?: string;
  position?: string;
  // html asset
  html?: string;
  css?: string;
  width?: number;
  height?: number;
}

interface ShotstackTrack {
  clips: ShotstackClip[];
}

interface ShotstackEdit {
  timeline: {
    soundtrack?: {
      src: string;
      effect: string;
      volume: number;
    };
    background?: string;
    tracks: ShotstackTrack[];
  };
  output: {
    format: 'mp4' | 'gif' | 'mp3';
    resolution?: string;
    aspectRatio?: string;
    size?: { width: number; height: number };
    fps?: number;
  };
  callback?: string;
}

interface ShotstackRenderResponse {
  success: boolean;
  message: string;
  response: {
    message: string;
    id: string;
  };
}

interface ShotstackStatusResponse {
  success: boolean;
  message: string;
  response: {
    id: string;
    owner: string;
    plan: string;
    status: 'queued' | 'fetching' | 'rendering' | 'saving' | 'done' | 'failed';
    error: string;
    duration: number;
    billable: number;
    renderTime: number;
    url: string;
    poster: string | null;
    thumbnail: string | null;
    created: string;
    updated: string;
  };
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SHOTSTACK_BASE = 'https://api.shotstack.io/edit';
const POLL_INTERVAL_MS = 4_000;   // 4s entre polls
const MAX_POLLS = 75;              // 5 minutos máximo

function getShotstackEnv(): string {
  return process.env.SHOTSTACK_ENV ?? 'stage';
}

function getShotstackKey(): string {
  const key = process.env.SHOTSTACK_API_KEY ?? '';
  if (!key) throw new Error('[ShotstackAdapter] SHOTSTACK_API_KEY não configurado');
  return key;
}

function renderUrl(): string {
  return `${SHOTSTACK_BASE}/${getShotstackEnv()}/render`;
}

function statusUrl(renderId: string): string {
  return `${SHOTSTACK_BASE}/${getShotstackEnv()}/render/${renderId}`;
}

// ---------------------------------------------------------------------------
// RenderSpec → Shotstack Edit JSON
// ---------------------------------------------------------------------------

/**
 * Converte nosso RenderSpec interno para o formato JSON do Shotstack.
 * Cada scene do RenderSpec vira um conjunto de clips em tracks separadas.
 */
export function buildShotstackEdit(
  spec: RenderSpec,
  assetUrlMap: Map<string, string>,
): ShotstackEdit {
  // Detecta aspecto e resolução
  const isVertical = spec.aspectRatio === '9:16';
  const [width, height] = spec.resolution ?? (isVertical ? [1080, 1920] : [1920, 1080]);

  // Tracks separadas: imagens/vídeo na base, textos em cima
  const imageTrack: ShotstackClip[] = [];
  const textTrack: ShotstackClip[] = [];
  const narrationTrack: ShotstackClip[] = [];

  let cursor = 0; // posição no timeline em segundos

  for (const scene of spec.scenes) {
    const duration = scene.durationSeconds ?? 5;

    // --- Asset principal (imagem ou vídeo) ---
    const assetId = scene.assetId ?? scene.assetIds?.[0] ?? null;
    const assetUrl = assetId ? assetUrlMap.get(assetId) : null;

    if (assetUrl) {
      const effectMap: Record<string, string> = {
        ken_burns_zoom_in:  'zoomIn',
        ken_burns_zoom_out: 'zoomOut',
        pan_left:           'slideRight',
        pan_right:          'slideLeft',
        pan_up:             'slideDown',
        pan_down:           'slideUp',
        static:             'zoomIn', // fallback
      };

      // compositionHint não tem motionEffect — Ken Burns é o default no Shotstack
      const effect = effectMap['ken_burns_zoom_in'];

      // Detecta se é vídeo pelo URL
      const isVideo = /\.(mp4|mov|webm|avi)$/i.test(assetUrl);

      const transition = mapTransition(scene.transition);

      imageTrack.push({
        asset: {
          type: isVideo ? 'video' : 'image',
          src: assetUrl,
        },
        start: cursor,
        length: duration,
        effect,
        transition,
      });
    }

    // --- Text overlays ---
    for (const overlay of scene.textOverlays ?? []) {
      if (!overlay.text) continue;

      const positionMap: Record<string, string> = {
        top:    'top',
        center: 'center',
        bottom: 'bottom',
      };

      const sizeMap: Record<string, string> = {
        small:  'x-small',
        medium: 'medium',
        large:  'large',
        xl:     'x-large',
      };

      textTrack.push({
        asset: {
          type: 'title',
          text: overlay.text,
          style: 'minimal',
          color: scene.branding?.textColor ?? '#ffffff',
          size: sizeMap[overlay.size ?? 'medium'] ?? 'medium',
          background: 'rgba(0,0,0,0.4)',
          position: positionMap[overlay.position ?? 'bottom'] ?? 'bottom',
        },
        start: cursor + 0.3, // pequeno delay para entrar suavemente
        length: duration - 0.6,
        transition: { in: 'fadeIn', out: 'fadeOut' },
      });
    }

    // Narração TTS: RenderNarration.voiceover é o texto, não URL de áudio
    // O áudio TTS é gerado separadamente e passado via options se disponível

    cursor += duration;
  }

  // --- Trilha sonora de fundo ---
  const soundtrack = spec.backgroundMusic?.trackPath
    ? {
        src: spec.backgroundMusic.trackPath,
        effect: 'fadeInFadeOut' as const,
        volume: spec.mixConfig?.musicVolume ?? 0.15,
      }
    : undefined;

  // --- Monta as tracks finais ---
  const tracks: ShotstackTrack[] = [];
  if (textTrack.length > 0)     tracks.push({ clips: textTrack });
  if (imageTrack.length > 0)    tracks.push({ clips: imageTrack });
  if (narrationTrack.length > 0) tracks.push({ clips: narrationTrack });

  if (tracks.length === 0) {
    throw new Error('[ShotstackAdapter] Nenhuma cena com assets válidos para render');
  }

  return {
    timeline: {
      ...(soundtrack ? { soundtrack } : {}),
      background: spec.scenes[0]?.branding?.backgroundColor ?? '#000000',
      tracks,
    },
    output: {
      format: 'mp4',
      aspectRatio: isVertical ? '9:16' : '16:9',
      size: { width, height },
      fps: 30,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapTransition(t: string | null | undefined): { in?: string; out?: string } | undefined {
  if (!t || t === 'cut' || t === 'none') return undefined;

  const map: Record<string, string> = {
    'fade': 'fade',
    'dissolve': 'fade',
    'slide-left': 'slideLeft',
    'slide-right': 'slideRight',
    'slide-up': 'slideUp',
    'slide-down': 'slideDown',
    'slide': 'slideLeft',
    'wipe': 'wipeLeft',
    'wipe-left': 'wipeLeft',
    'wipe-right': 'wipeRight',
    'zoom': 'zoom',
    'zoom-in': 'zoom',
    'zoom-out': 'zoom',
    'reveal': 'reveal',
  };

  const mapped = map[t] ?? 'fade';
  return { in: mapped, out: mapped };
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function submitRender(edit: ShotstackEdit): Promise<string> {
  const res = await fetch(renderUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getShotstackKey(),
    },
    body: JSON.stringify(edit),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[ShotstackAdapter] Submit failed ${res.status}: ${body}`);
  }

  const data = await res.json() as ShotstackRenderResponse;
  if (!data.success || !data.response?.id) {
    throw new Error(`[ShotstackAdapter] Submit sem ID: ${JSON.stringify(data)}`);
  }

  return data.response.id;
}

async function pollRender(renderId: string): Promise<ShotstackStatusResponse['response']> {
  const key = getShotstackKey();
  let polls = 0;

  while (polls < MAX_POLLS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    polls++;

    const res = await fetch(statusUrl(renderId), {
      headers: { 'x-api-key': key },
    });

    if (!res.ok) {
      logger.warn(`[ShotstackAdapter] Poll ${polls} status ${res.status} — retrying`);
      continue;
    }

    const data = await res.json() as ShotstackStatusResponse;
    const r = data.response;

    logger.info(`[ShotstackAdapter] Poll ${polls} — status=${r.status} id=${renderId}`);

    if (r.status === 'done') return r;
    if (r.status === 'failed') {
      throw new Error(`[ShotstackAdapter] Render falhou: ${r.error || 'unknown error'}`);
    }
  }

  throw new Error(`[ShotstackAdapter] Timeout após ${MAX_POLLS} polls (~${MAX_POLLS * POLL_INTERVAL_MS / 1000}s)`);
}

// ---------------------------------------------------------------------------
// Main export — mesma assinatura de renderFromSpec()
// ---------------------------------------------------------------------------

/**
 * Renderiza um RenderSpec usando a API do Shotstack.
 * Substitui renderFromSpec() do spec-renderer.ts sem mudar a interface.
 *
 * O VideoRenderResult retornado tem outputPath = URL do MP4 no CDN do Shotstack.
 */
export async function renderWithShotstack(
  spec: RenderSpec,
  options: SpecRenderOptions,
): Promise<VideoRenderResult> {
  const startTime = Date.now();
  const warnings: string[] = [];

  logger.info(`[ShotstackAdapter] Iniciando render — ${spec.scenes.length} cenas — env=${getShotstackEnv()}`);

  // 1. Constrói mapa assetId → URL pública
  // options.assetMap tem assetId → path local; precisamos de URLs públicas
  // Na V1 os assets já estão no Supabase Storage com URL pública
  const assetUrlMap = new Map<string, string>();
  for (const [assetId, localPath] of options.assetMap.entries()) {
    // Se já é uma URL pública, usa direto
    if (localPath.startsWith('http://') || localPath.startsWith('https://')) {
      assetUrlMap.set(assetId, localPath);
    } else {
      // Path local — o Shotstack não consegue acessar, registra warning
      warnings.push(`Asset ${assetId} é path local (${localPath}) — será pulado pelo Shotstack`);
      logger.warn(`[ShotstackAdapter] Asset local ignorado: ${assetId} = ${localPath}`);
    }
  }

  const scenesWithAssets = spec.scenes.filter(s => {
    const id = s.assetId ?? s.assetIds?.[0];
    return id && assetUrlMap.has(id);
  });

  if (scenesWithAssets.length === 0) {
    throw new Error('[ShotstackAdapter] Nenhuma cena com URL pública de asset — verifique o Supabase Storage');
  }

  if (scenesWithAssets.length < spec.scenes.length) {
    warnings.push(`${spec.scenes.length - scenesWithAssets.length} cenas sem URL pública foram puladas`);
  }

  // 2. Constrói o edit JSON do Shotstack
  const edit = buildShotstackEdit(
    { ...spec, scenes: scenesWithAssets },
    assetUrlMap,
  );

  logger.info(`[ShotstackAdapter] Edit JSON pronto — ${scenesWithAssets.length} cenas`);

  // 3. Submete para render
  const renderId = await submitRender(edit);
  logger.info(`[ShotstackAdapter] Render submetido — id=${renderId}`);

  // 4. Polling até done
  const result = await pollRender(renderId);
  const durationMs = Date.now() - startTime;

  logger.info(`[ShotstackAdapter] Render concluído — url=${result.url} em ${durationMs}ms`);

  // 5. Retorna no formato VideoRenderResult
  // outputPath = URL do MP4 no CDN Shotstack
  // filename = último segmento da URL
  const filename = `${renderId}.mp4`;

  return {
    outputPath: result.url,           // URL pública do MP4 no Shotstack CDN
    filename,
    sizeBytes: 0,                     // Shotstack não retorna tamanho
    durationSeconds: result.duration ?? 0,
    sceneCount: scenesWithAssets.length,
    resolution: spec.resolution ?? [1080, 1920],
    skippedScenes: [],
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Verificação de configuração
// ---------------------------------------------------------------------------

export function isShotstackConfigured(): boolean {
  return !!process.env.SHOTSTACK_API_KEY;
}
