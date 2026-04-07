/**
 * Built-in Variant Specs — Catálogo de variantes pré-definidas
 *
 * Define as variantes iniciais suportadas pelo sistema.
 * Cada variante é um override leve sobre o RenderSpec base.
 *
 * Parte 65: Variant Generation Engine
 */

import type { VariantSpec, ChannelProfile } from '../../domain/entities/variant.js';
import { DistributionChannel, TextDensity } from '../../domain/entities/variant.js';

// ---------------------------------------------------------------------------
// Variant Specs
// ---------------------------------------------------------------------------

export const VARIANT_REEL_15S: VariantSpec = {
  id: 'reel_15s_9x16',
  name: 'Reel 15s (9:16)',
  channel: DistributionChannel.INSTAGRAM_REELS,
  aspectRatio: '9:16',
  resolution: [1080, 1920],
  targetDurationSeconds: 15,
  maxScenes: 5,
  textDensity: TextDensity.MINIMAL,
  defaultPresetId: 'fast-sales',
  hardcodedSubtitles: true,
  priority: 1,
};

export const VARIANT_REEL_30S: VariantSpec = {
  id: 'reel_30s_9x16',
  name: 'Reel 30s (9:16)',
  channel: DistributionChannel.INSTAGRAM_REELS,
  aspectRatio: '9:16',
  resolution: [1080, 1920],
  targetDurationSeconds: 30,
  maxScenes: 10,
  textDensity: TextDensity.NORMAL,
  defaultPresetId: 'fast-sales',
  hardcodedSubtitles: true,
  priority: 2,
};

export const VARIANT_STORY: VariantSpec = {
  id: 'story_9x16',
  name: 'Story (9:16)',
  channel: DistributionChannel.INSTAGRAM_STORIES,
  aspectRatio: '9:16',
  resolution: [1080, 1920],
  targetDurationSeconds: 15,
  maxScenes: 4,
  textDensity: TextDensity.MINIMAL,
  defaultPresetId: 'fast-sales',
  hardcodedSubtitles: false,
  priority: 3,
};

export const VARIANT_SQUARE: VariantSpec = {
  id: 'square_1x1',
  name: 'Square (1:1)',
  channel: DistributionChannel.INSTAGRAM_FEED,
  aspectRatio: '1:1',
  resolution: [1080, 1080],
  targetDurationSeconds: 30,
  maxScenes: 10,
  textDensity: TextDensity.NORMAL,
  defaultPresetId: 'corporate',
  hardcodedSubtitles: true,
  priority: 4,
};

export const VARIANT_LANDSCAPE: VariantSpec = {
  id: 'landscape_16x9',
  name: 'Landscape (16:9)',
  channel: DistributionChannel.YOUTUBE,
  aspectRatio: '16:9',
  resolution: [1920, 1080],
  targetDurationSeconds: null, // Use all scenes
  maxScenes: null,
  textDensity: TextDensity.NORMAL,
  defaultPresetId: 'corporate',
  hardcodedSubtitles: false,
  priority: 5,
};

export const VARIANT_WHATSAPP_LONG: VariantSpec = {
  id: 'whatsapp_longform',
  name: 'WhatsApp Longform (9:16)',
  channel: DistributionChannel.WHATSAPP,
  aspectRatio: '9:16',
  resolution: [720, 1280],  // Lower res for WhatsApp file size limits
  targetDurationSeconds: 60,
  maxScenes: 15,
  textDensity: TextDensity.DENSE,
  defaultPresetId: 'luxury',
  hardcodedSubtitles: true,
  priority: 6,
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const VARIANT_REGISTRY: Record<string, VariantSpec> = {
  'reel_15s_9x16': VARIANT_REEL_15S,
  'reel_30s_9x16': VARIANT_REEL_30S,
  'story_9x16': VARIANT_STORY,
  'square_1x1': VARIANT_SQUARE,
  'landscape_16x9': VARIANT_LANDSCAPE,
  'whatsapp_longform': VARIANT_WHATSAPP_LONG,
};

export const ALL_VARIANT_SPECS: VariantSpec[] = Object.values(VARIANT_REGISTRY);

// ---------------------------------------------------------------------------
// Channel Profiles
// ---------------------------------------------------------------------------

export const CHANNEL_PROFILES: Record<DistributionChannel, ChannelProfile> = {
  [DistributionChannel.INSTAGRAM_REELS]: {
    channel: DistributionChannel.INSTAGRAM_REELS,
    maxDurationSeconds: 90,
    maxFileSizeBytes: 250 * 1024 * 1024,
    supportedAspectRatios: ['9:16'],
    maxResolution: [1080, 1920],
    supportsSidecarSubtitles: false,
    recommendedCodec: 'libx264',
  },
  [DistributionChannel.INSTAGRAM_STORIES]: {
    channel: DistributionChannel.INSTAGRAM_STORIES,
    maxDurationSeconds: 60,
    maxFileSizeBytes: 250 * 1024 * 1024,
    supportedAspectRatios: ['9:16'],
    maxResolution: [1080, 1920],
    supportsSidecarSubtitles: false,
    recommendedCodec: 'libx264',
  },
  [DistributionChannel.INSTAGRAM_FEED]: {
    channel: DistributionChannel.INSTAGRAM_FEED,
    maxDurationSeconds: 60,
    maxFileSizeBytes: 250 * 1024 * 1024,
    supportedAspectRatios: ['1:1', '4:5', '16:9'],
    maxResolution: [1080, 1350],
    supportsSidecarSubtitles: false,
    recommendedCodec: 'libx264',
  },
  [DistributionChannel.WHATSAPP]: {
    channel: DistributionChannel.WHATSAPP,
    maxDurationSeconds: 180,
    maxFileSizeBytes: 64 * 1024 * 1024,
    supportedAspectRatios: ['9:16', '16:9', '1:1'],
    maxResolution: [1280, 1280],
    supportsSidecarSubtitles: false,
    recommendedCodec: 'libx264',
  },
  [DistributionChannel.YOUTUBE_SHORTS]: {
    channel: DistributionChannel.YOUTUBE_SHORTS,
    maxDurationSeconds: 60,
    maxFileSizeBytes: 256 * 1024 * 1024,
    supportedAspectRatios: ['9:16'],
    maxResolution: [1080, 1920],
    supportsSidecarSubtitles: true,
    recommendedCodec: 'libx264',
  },
  [DistributionChannel.YOUTUBE]: {
    channel: DistributionChannel.YOUTUBE,
    maxDurationSeconds: 43200,
    maxFileSizeBytes: 256 * 1024 * 1024 * 1024,
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    maxResolution: [3840, 2160],
    supportsSidecarSubtitles: true,
    recommendedCodec: 'libx264',
  },
  [DistributionChannel.TIKTOK]: {
    channel: DistributionChannel.TIKTOK,
    maxDurationSeconds: 180,
    maxFileSizeBytes: 287 * 1024 * 1024,
    supportedAspectRatios: ['9:16'],
    maxResolution: [1080, 1920],
    supportsSidecarSubtitles: false,
    recommendedCodec: 'libx264',
  },
  [DistributionChannel.LINKEDIN]: {
    channel: DistributionChannel.LINKEDIN,
    maxDurationSeconds: 600,
    maxFileSizeBytes: 200 * 1024 * 1024,
    supportedAspectRatios: ['16:9', '1:1', '9:16'],
    maxResolution: [1920, 1080],
    supportsSidecarSubtitles: true,
    recommendedCodec: 'libx264',
  },
  [DistributionChannel.WEBSITE]: {
    channel: DistributionChannel.WEBSITE,
    maxDurationSeconds: 600,
    maxFileSizeBytes: 500 * 1024 * 1024,
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    maxResolution: [1920, 1080],
    supportsSidecarSubtitles: true,
    recommendedCodec: 'libx264',
  },
  [DistributionChannel.GENERIC]: {
    channel: DistributionChannel.GENERIC,
    maxDurationSeconds: 600,
    maxFileSizeBytes: 500 * 1024 * 1024,
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    maxResolution: [1920, 1080],
    supportsSidecarSubtitles: true,
    recommendedCodec: 'libx264',
  },
};
