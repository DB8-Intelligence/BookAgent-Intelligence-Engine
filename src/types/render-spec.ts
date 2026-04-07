/**
 * RenderSpec — Shared Contract Types
 *
 * Single source of truth for the RenderSpec format used by:
 *   - Producer: media-exporter.ts (builds RenderSpec from MediaPlan)
 *   - Consumer: spec-renderer.ts (renders RenderSpec to .mp4)
 *   - Controller: videoRenderController.ts (validates RenderSpec)
 *
 * Parte 59.2: Unificação do contrato RenderSpec
 * Parte 62: backgroundMusic + mixConfig
 * Parte 63: presetId + motionProfile + transitionProfile
 * Parte 64: subtitles + captionStyle
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
  /** Background music configuration (Parte 62) */
  backgroundMusic?: RenderBackgroundMusic | null;
  /** Audio mix configuration (Parte 62) */
  mixConfig?: RenderMixConfig | null;
  /** Preset ID applied to this render (Parte 63) */
  presetId?: string | null;
  /** Motion profile from preset (Parte 63) */
  motionProfile?: RenderMotionProfile | null;
  /** Transition profile from preset (Parte 63) */
  transitionProfile?: RenderTransitionProfile | null;
  /** Subtitle cues for burn-in or sidecar export (Parte 64) */
  subtitles?: RenderSubtitleCue[] | null;
  /** Caption visual style (Parte 64) */
  captionStyle?: RenderCaptionStyle | null;
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
// Background Music (Parte 62)
// ============================================================================

export interface RenderBackgroundMusic {
  /** Track ID from music catalog */
  trackId: string;
  /** Track file path (resolved at render time) */
  trackPath?: string;
  /** Mood category for logging/debugging */
  mood: string;
}

export interface RenderMixConfig {
  /** Music volume 0.0-1.0 (default: 0.15) */
  musicVolume: number;
  /** Narration volume 0.0-1.0 (default: 1.0) */
  narrationVolume: number;
  /** Ducking reduction in dB when voice is active (default: -10) */
  duckingDb: number;
  /** Fade-in at start (seconds) */
  fadeInSeconds: number;
  /** Fade-out at end (seconds) */
  fadeOutSeconds: number;
}

// ============================================================================
// Preset Profiles (Parte 63)
// ============================================================================

export interface RenderMotionProfile {
  /** Default scene duration in seconds */
  defaultSceneDuration: number;
  /** Motion intensity: 'static' | 'subtle' | 'dynamic' */
  motionIntensity: string;
  /** Ken Burns zoom enabled */
  kenBurnsEnabled: boolean;
  /** Ken Burns zoom factor (e.g. 1.05) */
  kenBurnsZoomFactor: number;
}

export interface RenderTransitionProfile {
  /** Default transition type */
  defaultTransition: string;
  /** Transition duration in seconds */
  transitionDuration: number;
  /** Allowed transitions for this preset */
  allowedTransitions: string[];
}

// ============================================================================
// Subtitles (Parte 64)
// ============================================================================

export interface RenderSubtitleCue {
  /** Cue index (1-based) */
  index: number;
  /** Subtitle text */
  text: string;
  /** Start time in seconds */
  startSeconds: number;
  /** End time in seconds */
  endSeconds: number;
}

export interface RenderCaptionStyle {
  /** Vertical position: 'top' | 'center' | 'bottom' */
  position: string;
  /** Font size: 'small' | 'medium' | 'large' */
  fontSize: string;
  /** Font color (hex) */
  fontColor: string;
  /** Background type: 'none' | 'box' | 'box-transparent' | 'outline' | 'shadow' */
  background: string;
  /** Background color (hex) */
  backgroundColor: string;
}

// ============================================================================
// Video render status
// ============================================================================

export type VideoRenderStatus = 'queued' | 'processing' | 'completed' | 'failed';
