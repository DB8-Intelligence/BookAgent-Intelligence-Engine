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
 *
 * Também gera artefatos MEDIA_METADATA com captions, hashtags e
 * metadados para publicação em redes sociais.
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

// ---------------------------------------------------------------------------
// Render Spec structure (JSON output)
// ---------------------------------------------------------------------------

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
  metadata: Record<string, unknown>;
}

interface RenderSceneSpec {
  order: number;
  role: string;
  durationSeconds: number | null;
  assetId: string | null;
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

/**
 * Exporta MediaPlans como artefatos de renderização.
 * Para cada MediaPlan gera:
 * 1. RENDER_SPEC (JSON com especificação técnica completa)
 * 2. MEDIA_METADATA (JSON com captions e metadados para publicação)
 */
export function exportMediaPlans(plans: MediaPlan[]): ExportArtifact[] {
  const artifacts: ExportArtifact[] = [];

  for (const plan of plans) {
    // Render spec
    const renderArtifact = buildRenderSpecArtifact(plan);
    artifacts.push(renderArtifact);

    // Social metadata
    const metadataArtifact = buildMetadataArtifact(plan);
    artifacts.push(metadataArtifact);
  }

  return artifacts;
}

// ---------------------------------------------------------------------------
// Render spec builder
// ---------------------------------------------------------------------------

function buildRenderSpecArtifact(plan: MediaPlan): ExportArtifact {
  const warnings: string[] = [];

  // Verificar status de renderização
  if (plan.renderStatus === RenderStatus.NEEDS_ASSETS) {
    warnings.push('Plano necessita de assets adicionais para renderização completa');
  }
  if (plan.renderStatus === RenderStatus.NEEDS_TEXT) {
    warnings.push('Plano necessita de texto adicional em alguns overlays');
  }
  if (plan.renderStatus === RenderStatus.NOT_READY) {
    warnings.push('Plano não está pronto para renderização');
  }

  const spec = buildRenderSpec(plan);
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

function buildRenderSpec(plan: MediaPlan): RenderSpec {
  return {
    version: '1.0.0',
    format: plan.format,
    aspectRatio: plan.aspectRatio?.label ?? '9:16',
    resolution: plan.resolution ?? [1080, 1920],
    totalDurationSeconds: plan.totalDurationSeconds,
    scenes: plan.scenes.map(buildRenderSceneSpec),
    branding: {
      logoUrl: (plan.renderMetadata?.userLogo as string) ?? null,
      logoPlacement: (plan.renderMetadata?.userLogoPlacement as string) ?? null,
      signature: (plan.renderMetadata?.userSignature as string) ?? null,
    },
    metadata: plan.renderMetadata ?? {},
  };
}

function buildRenderSceneSpec(scene: MediaScene): RenderSceneSpec {
  return {
    order: scene.order,
    role: scene.role,
    durationSeconds: scene.durationSeconds ?? null,
    assetId: scene.assetIds[0] ?? null,
    layout: scene.layoutHint,
    transition: scene.transition,
    textOverlays: scene.textOverlays.map((o) => ({
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
  // Extrair caption dos text overlays da primeira cena
  const firstScene = plan.scenes[0];
  const headline = firstScene?.textOverlays.find((o) => o.role === 'headline')?.text ?? '';
  const ctaScene = plan.scenes.find((s) => s.role === 'cta');
  const ctaText = ctaScene?.textOverlays.find((o) => o.role === 'cta')?.text ?? '';

  // Gerar caption combinando headline e CTA
  const captionParts = [headline, ctaText].filter(Boolean);
  const caption = captionParts.join(' | ');

  // Gerar hashtags a partir dos overlays e títulos
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

  // Tags padrão imobiliário
  tags.add('#imoveis');
  tags.add('#lancamento');

  // Tags baseadas nos overlays
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
