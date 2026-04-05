/**
 * RenderSpec — Shared Contract Types
 *
 * Single source of truth for the RenderSpec format used by:
 *   - Producer: media-exporter.ts (builds RenderSpec from MediaPlan)
 *   - Consumer: spec-renderer.ts (renders RenderSpec to .mp4)
 *   - Controller: videoRenderController.ts (validates RenderSpec)
 *
 * Parte 59.2: Unificação do contrato RenderSpec
 */

// ============================================================================
// RenderSpec — top-level structure
// ============================================================================

export interface RenderSpec {
  version: string;
  format: string;
  aspectRatio: string;
  resolution: [number, number];
  totalDurationSeconds: number | null;
  scenes: RenderSceneSpec[];
  branding: RenderBrandingSpec;
  metadata: Record<string, unknown>;
}

export interface RenderBrandingSpec {
  logoUrl: string | null;
  logoPlacement: string | null;
  signature: string | null;
}

// ============================================================================
// RenderSceneSpec — per-scene structure
// ============================================================================

export interface RenderSceneSpec {
  order: number;
  role: string;
  durationSeconds: number | null;
  /** Primary asset ID (backwards compat) */
  assetId: string | null;
  /** All asset IDs for multi-asset layouts (GRID, SPLIT) */
  assetIds: string[];
  layout: string;
  transition: string;
  textOverlays: RenderTextOverlay[];
  branding: RenderSceneBranding;
  narration: RenderNarration | null;
  compositionHint: RenderCompositionHint;
}

export interface RenderTextOverlay {
  text: string;
  role: string;
  position: string;
  size: string;
}

export interface RenderSceneBranding {
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  showLogo: boolean;
  visualStyle: string;
}

export interface RenderNarration {
  headline: string;
  voiceover: string;
  visualDescription: string;
}

export interface RenderCompositionHint {
  baseAssetReadOnly: boolean;
  layerCount: number;
  hasTextOverlay: boolean;
  hasBrandingOverlay: boolean;
  hasVisualEffect: boolean;
}

// ============================================================================
// Video render status
// ============================================================================

export type VideoRenderStatus = 'queued' | 'processing' | 'completed' | 'failed';
