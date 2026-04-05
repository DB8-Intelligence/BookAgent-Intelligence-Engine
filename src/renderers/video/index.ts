/**
 * Video Renderer — Public API
 *
 * renderFromSpec() is the official entry point for video rendering (Parte 59.1).
 * renderVideo() is preserved for backwards compatibility but should NOT be used
 * in new code — it consumes MediaPlan directly, bypassing the RenderSpec contract.
 */

// Official API (RenderSpec-based) — Parte 59.1
export { renderFromSpec } from './spec-renderer.js';
export type { RenderSpec, RenderSceneSpec, SpecRenderOptions } from './spec-renderer.js';

// Legacy API (MediaPlan-based) — Parte 58, preserved for compatibility
export { renderVideo } from './video-renderer.js';

// Shared
export { checkFFmpeg } from './ffmpeg.js';
export type { VideoRenderOptions, VideoRenderResult, SceneClip } from './types.js';
