/**
 * Media Exporter
 *
 * Serializa MediaPlan[] em ExportArtifact[] com formato RENDER_SPEC.
 *
 * Gera especificações técnicas de renderização que podem ser consumidas
 * por motores de vídeo/imagem (FFmpeg, Remotion, Canvas, etc.):
 *
 * - Sequência de cenas com timing exato
 * - Posicionamento de overlays de texto
 * - Instruções de branding (cores, logo)
 * - Transições entre cenas
 * - Metadados de aspect ratio e resolução
 * - CompositionSpec por cena (modelo formal de camadas separadas)
 * - Script de narração por cena (gerado localmente ou com IA)
 *
 * POLÍTICA DE PRESERVAÇÃO:
 * Assets originais são REFERENCIADOS por ID, nunca modificados.
 *
 * @see ASSET_IMMUTABILITY_POLICY em domain/policies/asset-immutability.ts
 */

import { v4 as uuid } from 'uuid';
import type { MediaPlan, MediaScene } from '../../domain/entities/media-plan.js';
import { RenderStatus } from '../../domain/entities/media-plan.js';
import type { ExportArtifact } from '../../domain/entities/export-artifact.js';
import {
  ExportFormat,
  ArtifactType,
  ArtifactStatus,
} from '../../domain/entities/export-artifact.js';
import type { AITextService } from '../../services/ai-text-service.js';
import type { GeneratedMediaScript, GeneratedSceneScript } from '../../generation/types.js';
import type { ToneOfVoice } from '../../domain/entities/narrative.js';
import { resolvePreset } from '../presets/index.js';
import { DEFAULT_MIX_CONFIG } from '../../domain/entities/music.js';
import type { SoundtrackProfile } from '../../domain/entities/audio-plan.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Render Spec structure (JSON output)
// ---------------------------------------------------------------------------

interface NarrationSpec {
  headline: string;
  voiceover: string;
  visualDescription: string;
}

interface RenderSpec {
  version: string;
  format: string;
  aspectRatio: string;
  resolution: [number, number];
  totalDurationSeconds: number | null;
  scenes: RenderSceneSpec[];
  branding: {
    logoUrl: string | null;
    logoPlacement: string | null;
    signature: string | null;
  };
  /** Background music reference (Parte 62) */
  backgroundMusic?: {
    trackId: string;
    trackPath?: string;
    mood: string;
  } | null;
  /** Audio mix config (Parte 62) */
  mixConfig?: {
    musicVolume: number;
    narrationVolume: number;
    duckingDb: number;
    fadeInSeconds: number;
    fadeOutSeconds: number;
  } | null;
  /** Preset ID (Parte 63) */
  presetId?: string | null;
  /** Motion profile from preset (Parte 63) */
  motionProfile?: {
    defaultSceneDuration: number;
    motionIntensity: string;
    kenBurnsEnabled: boolean;
    kenBurnsZoomFactor: number;
  } | null;
  /** Transition profile from preset (Parte 63) */
  transitionProfile?: {
    defaultTransition: string;
    transitionDuration: number;
    allowedTransitions: string[];
  } | null;
  metadata: Record<string, unknown>;
}

interface RenderSceneSpec {
  order: number;
  role: string;
  durationSeconds: number | null;
  assetId: string | null;
  /** All asset IDs for multi-asset layouts (GRID, SPLIT). Parte 59.1 */
  assetIds: string[];
  layout: string;
  transition: string;
  textOverlays: Array<{
    text: string;
    role: string;
    position: string;
    size: string;
  }>;
  branding: {
    backgroundColor: string;
    textColor: string;
    accentColor: string;
    showLogo: boolean;
    visualStyle: string;
  };
  narration: NarrationSpec | null;
  compositionHint: {
    baseAssetReadOnly: boolean;
    layerCount: number;
    hasTextOverlay: boolean;
    hasBrandingOverlay: boolean;
    hasVisualEffect: boolean;
  };
}

// ---------------------------------------------------------------------------
// Social metadata structure
// ---------------------------------------------------------------------------

interface SocialMetadata {
  title: string;
  caption: string;
  hashtags: string[];
  format: string;
  aspectRatio: string;
  sceneCount: number;
  durationSeconds: number | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Options for exportMediaPlans (Parte 62+63 additions) */
export interface ExportMediaOptions {
  /** AI text service for script generation */
  aiService?: AITextService | null;
  /** Tone of voice for preset inference (Parte 63) */
  tone?: ToneOfVoice;
  /** Explicit preset ID override (Parte 63) */
  presetId?: string;
  /** Soundtrack profile from AudioPlan (Parte 62) */
  soundtrackProfile?: SoundtrackProfile;
}

/**
 * Exporta MediaPlans como artefatos de renderização.
 * Para cada MediaPlan gera:
 * 1. RENDER_SPEC (JSON com especificação técnica + narração por cena)
 * 2. MEDIA_METADATA (JSON com captions e metadados para publicação)
 *
 * @param plans - MediaPlans gerados pelo pipeline
 * @param aiServiceOrOpts - AITextService ou ExportMediaOptions
 */
export async function exportMediaPlans(
  plans: MediaPlan[],
  aiServiceOrOpts?: AITextService | ExportMediaOptions | null,
): Promise<ExportArtifact[]> {
  // Backwards-compatible: accept AITextService directly or options object
  const opts: ExportMediaOptions = aiServiceOrOpts && typeof aiServiceOrOpts === 'object' && 'aiService' in aiServiceOrOpts
    ? aiServiceOrOpts as ExportMediaOptions
    : { aiService: aiServiceOrOpts as AITextService | null | undefined };

  const artifacts: ExportArtifact[] = [];

  for (const plan of plans) {
    // Gerar script de narração (AI ou local — sempre gera, agrega ao spec)
    let script: GeneratedMediaScript | null = null;
    try {
      if (opts.aiService) {
        script = await opts.aiService.generateMediaScript(plan);
      } else {
        // Gerar localmente sem AI (ainda agrega valor ao spec)
        const { generateMediaScript } = await import('../../generation/media-script-generator.js');
        script = await generateMediaScript(plan, { mode: 'local', projectName: plan.title ?? undefined });
      }
    } catch (err) {
      logger.warn(`[MediaExporter] Script generation failed for "${plan.title}": ${err}`);
    }

    artifacts.push(buildRenderSpecArtifact(plan, script, opts));
    artifacts.push(buildMetadataArtifact(plan));
  }

  return artifacts;
}

// ---------------------------------------------------------------------------
// Render spec builder
// ---------------------------------------------------------------------------

function buildRenderSpecArtifact(
  plan: MediaPlan,
  script: GeneratedMediaScript | null,
  opts?: ExportMediaOptions,
): ExportArtifact {
  const warnings: string[] = [];

  if (plan.renderStatus === RenderStatus.NEEDS_ASSETS) {
    warnings.push('Plano necessita de assets adicionais para renderização completa');
  }
  if (plan.renderStatus === RenderStatus.NEEDS_TEXT) {
    warnings.push('Plano necessita de texto adicional em alguns overlays');
  }
  if (plan.renderStatus === RenderStatus.NOT_READY) {
    warnings.push('Plano não está pronto para renderização');
  }

  const spec = buildRenderSpec(plan, script, opts);
  const content = JSON.stringify(spec, null, 2);
  const referencedAssetIds = collectAssetIds(plan.scenes);

  const status = plan.renderStatus === RenderStatus.READY
    ? ArtifactStatus.VALID
    : plan.renderStatus === RenderStatus.NOT_READY
      ? ArtifactStatus.INVALID
      : ArtifactStatus.PARTIAL;

  return {
    id: uuid(),
    artifactType: ArtifactType.MEDIA_RENDER_SPEC,
    exportFormat: ExportFormat.RENDER_SPEC,
    outputFormat: plan.format,
    narrativeType: plan.narrativeType,
    planId: plan.id,
    title: `Render Spec: ${plan.title ?? plan.format}`,
    content,
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
    status,
    warnings,
    referencedAssetIds,
    createdAt: new Date(),
  };
}

function buildRenderSpec(
  plan: MediaPlan,
  script: GeneratedMediaScript | null,
  opts?: ExportMediaOptions,
): RenderSpec {
  // Indexar cenas do script por order para lookup O(1)
  const scriptSceneMap = new Map<number, GeneratedSceneScript>();
  if (script) {
    for (const scene of script.scenes) {
      scriptSceneMap.set(scene.order, scene);
    }
  }

  // Parte 63: Resolve preset
  const { presetId, motionProfile, transitionProfile } = resolvePreset(
    plan.format,
    opts?.tone,
    opts?.presetId,
  );

  // Parte 62: Build music + mix config from soundtrack profile
  const soundtrack = opts?.soundtrackProfile;
  const backgroundMusic = soundtrack && soundtrack.category !== 'none'
    ? {
        trackId: soundtrack.trackPath ?? soundtrack.category,
        trackPath: soundtrack.trackPath,
        mood: soundtrack.category,
      }
    : null;
  const mixConfig = soundtrack && soundtrack.category !== 'none'
    ? {
        musicVolume: soundtrack.volume ?? DEFAULT_MIX_CONFIG.musicVolume,
        narrationVolume: DEFAULT_MIX_CONFIG.narrationVolume,
        duckingDb: DEFAULT_MIX_CONFIG.duckingDb,
        fadeInSeconds: soundtrack.fadeInDuration ?? DEFAULT_MIX_CONFIG.fadeInSeconds,
        fadeOutSeconds: soundtrack.fadeOutDuration ?? DEFAULT_MIX_CONFIG.fadeOutSeconds,
      }
    : null;

  return {
    version: '1.1.0',
    format: plan.format,
    aspectRatio: plan.aspectRatio?.label ?? '9:16',
    resolution: plan.resolution ?? [1080, 1920],
    totalDurationSeconds: plan.totalDurationSeconds,
    scenes: plan.scenes.map((scene) =>
      buildRenderSceneSpec(scene, scriptSceneMap.get(scene.order) ?? null),
    ),
    branding: {
      logoUrl: (plan.renderMetadata?.userLogo as string) ?? null,
      logoPlacement: (plan.renderMetadata?.userLogoPlacement as string) ?? null,
      signature: (plan.renderMetadata?.userSignature as string) ?? null,
    },
    backgroundMusic,
    mixConfig,
    presetId,
    motionProfile,
    transitionProfile,
    metadata: plan.renderMetadata ?? {},
  };
}

function buildRenderSceneSpec(
  scene: MediaScene,
  scriptScene: GeneratedSceneScript | null,
): RenderSceneSpec {
  const hasAsset = scene.assetIds.length > 0;
  const hasText = scene.textOverlays.length > 0;
  const hasBranding = scene.branding.showLogo;

  // Narração: usa script gerado se disponível
  const narration: NarrationSpec | null = scriptScene
    ? {
        headline: scriptScene.headline,
        voiceover: scriptScene.narration,
        visualDescription: scriptScene.visualDescription,
      }
    : null;

  // When narration script has a headline, upgrade scene text overlays:
  // replace generic headline with the narration-generated commercial copy.
  const finalOverlays = scene.textOverlays.map((o) => {
    if (o.role === 'headline' && scriptScene?.headline) {
      return { ...o, text: scriptScene.headline };
    }
    if (o.role === 'cta' && scriptScene?.headline) {
      return { ...o, text: scriptScene.headline };
    }
    return o;
  });

  return {
    order: scene.order,
    role: scene.role,
    durationSeconds: scene.durationSeconds ?? null,
    assetId: scene.assetIds[0] ?? null,
    assetIds: [...scene.assetIds],
    layout: scene.layoutHint,
    transition: scene.transition,
    textOverlays: finalOverlays.map((o) => ({
      text: o.text,
      role: o.role,
      position: o.position,
      size: o.size,
    })),
    branding: {
      backgroundColor: scene.branding.backgroundColor,
      textColor: scene.branding.textColor,
      accentColor: scene.branding.accentColor,
      showLogo: scene.branding.showLogo,
      visualStyle: scene.branding.visualStyle,
    },
    narration,
    compositionHint: {
      baseAssetReadOnly: hasAsset,
      layerCount: (hasAsset ? 1 : 0) + (hasText ? 1 : 0) + (hasBranding ? 1 : 0) + 1,
      hasTextOverlay: hasText,
      hasBrandingOverlay: hasBranding,
      hasVisualEffect: hasAsset && hasText,
    },
  };
}

// ---------------------------------------------------------------------------
// Metadata builder
// ---------------------------------------------------------------------------

function buildMetadataArtifact(plan: MediaPlan): ExportArtifact {
  const metadata = buildSocialMetadata(plan);
  const content = JSON.stringify(metadata, null, 2);

  return {
    id: uuid(),
    artifactType: ArtifactType.MEDIA_METADATA,
    exportFormat: ExportFormat.JSON,
    outputFormat: plan.format,
    narrativeType: plan.narrativeType,
    planId: plan.id,
    title: `Metadata: ${plan.title ?? plan.format}`,
    content,
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
    status: ArtifactStatus.VALID,
    warnings: [],
    referencedAssetIds: collectAssetIds(plan.scenes),
    createdAt: new Date(),
  };
}

function buildSocialMetadata(plan: MediaPlan): SocialMetadata {
  const firstScene = plan.scenes[0];
  const headline = firstScene?.textOverlays.find((o) => o.role === 'headline')?.text ?? '';
  const ctaScene = plan.scenes.find((s) => s.role === 'cta');
  const ctaText = ctaScene?.textOverlays.find((o) => o.role === 'cta')?.text ?? '';

  const captionParts = [headline, ctaText].filter(Boolean);
  const caption = captionParts.join(' | ');
  const hashtags = generateHashtags(plan);

  return {
    title: plan.title ?? `${plan.format} — Empreendimento`,
    caption,
    hashtags,
    format: plan.format,
    aspectRatio: plan.aspectRatio?.label ?? '9:16',
    sceneCount: plan.scenes.length,
    durationSeconds: plan.totalDurationSeconds,
  };
}

function generateHashtags(plan: MediaPlan): string[] {
  const tags = new Set<string>();

  tags.add('#imoveis');
  tags.add('#lancamento');

  for (const scene of plan.scenes) {
    for (const overlay of scene.textOverlays) {
      const words = overlay.text
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4);
      for (const word of words.slice(0, 3)) {
        const clean = word.replace(/[^a-záàâãéèêíïóôõöúüçñ]/gi, '');
        if (clean.length > 3) {
          tags.add(`#${clean}`);
        }
      }
    }
  }

  return Array.from(tags).slice(0, 15);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectAssetIds(scenes: MediaScene[]): string[] {
  const ids = new Set<string>();
  for (const scene of scenes) {
    for (const id of scene.assetIds) {
      ids.add(id);
    }
  }
  return Array.from(ids);
}
