/**
 * Entity: OutputSpec
 *
 * Definição declarativa de um formato de output.
 * Descreve o que deve ser gerado, não como gerar.
 *
 * O OutputSpec é usado pelo Output Selection para decidir
 * quais formatos são viáveis dado os assets e fontes disponíveis,
 * e pelo Media Generation para parametrizar a geração.
 */

import type { OutputFormat, AspectRatio, SourceType } from '../value-objects/index.js';

export interface OutputSpec {
  /** Formato do output (reel, post, carousel, etc.) */
  format: OutputFormat;

  /** Nome legível */
  label: string;

  /** Aspect ratio do output */
  aspectRatio: AspectRatio;

  /** Resolução em pixels [width, height] */
  resolution: [number, number];

  /** Duração máxima em segundos (null para estáticos) */
  maxDurationSeconds: number | null;

  /** Duração mínima em segundos (null para estáticos) */
  minDurationSeconds: number | null;

  /** Tamanho máximo do arquivo em bytes */
  maxFileSizeBytes: number;

  /** Tipos de fonte obrigatórios para gerar este output */
  requiredSourceTypes: SourceType[];

  /** Número mínimo de assets para gerar este output */
  minAssets: number;

  /** Se suporta logo do usuário */
  supportsLogo: boolean;

  /** Modo de CTA */
  ctaMode: 'none' | 'simple' | 'full' | 'form';

  /** Canal de distribuição recomendado */
  channel: string;
}

/**
 * Catálogo de specs padrão para todos os outputs do BookAgent.
 * Usado como referência pelo Output Selection e Media Generation.
 */
export const OUTPUT_SPECS: Record<string, OutputSpec> = {
  reel: {
    format: 'reel' as OutputFormat,
    label: 'Reel',
    aspectRatio: { width: 9, height: 16, label: '9:16' },
    resolution: [1080, 1920],
    maxDurationSeconds: 90,
    minDurationSeconds: 15,
    maxFileSizeBytes: 50 * 1024 * 1024,
    requiredSourceTypes: ['hero' as SourceType],
    minAssets: 3,
    supportsLogo: true,
    ctaMode: 'simple',
    channel: 'Instagram Reels / TikTok',
  },

  video_short: {
    format: 'video_short' as OutputFormat,
    label: 'Vídeo Curto',
    aspectRatio: { width: 9, height: 16, label: '9:16' },
    resolution: [1080, 1920],
    maxDurationSeconds: 120,
    minDurationSeconds: 15,
    maxFileSizeBytes: 50 * 1024 * 1024,
    requiredSourceTypes: ['hero' as SourceType],
    minAssets: 3,
    supportsLogo: true,
    ctaMode: 'simple',
    channel: 'Instagram / YouTube Shorts',
  },

  video_long: {
    format: 'video_long' as OutputFormat,
    label: 'Vídeo Longo (WhatsApp)',
    aspectRatio: { width: 9, height: 16, label: '9:16' },
    resolution: [720, 1280],
    maxDurationSeconds: 300,
    minDurationSeconds: 120,
    maxFileSizeBytes: 16 * 1024 * 1024,
    requiredSourceTypes: ['hero' as SourceType],
    minAssets: 5,
    supportsLogo: true,
    ctaMode: 'full',
    channel: 'WhatsApp / Dashboard',
  },

  story: {
    format: 'story' as OutputFormat,
    label: 'Story',
    aspectRatio: { width: 9, height: 16, label: '9:16' },
    resolution: [1080, 1920],
    maxDurationSeconds: 15,
    minDurationSeconds: 5,
    maxFileSizeBytes: 10 * 1024 * 1024,
    requiredSourceTypes: ['hero' as SourceType],
    minAssets: 2,
    supportsLogo: true,
    ctaMode: 'simple',
    channel: 'Instagram Stories / WhatsApp Status',
  },

  carousel: {
    format: 'carousel' as OutputFormat,
    label: 'Carrossel',
    aspectRatio: { width: 1, height: 1, label: '1:1' },
    resolution: [1080, 1080],
    maxDurationSeconds: null,
    minDurationSeconds: null,
    maxFileSizeBytes: 5 * 1024 * 1024,
    requiredSourceTypes: ['hero' as SourceType],
    minAssets: 4,
    supportsLogo: true,
    ctaMode: 'full',
    channel: 'Instagram / LinkedIn',
  },

  post: {
    format: 'post' as OutputFormat,
    label: 'Post',
    aspectRatio: { width: 1, height: 1, label: '1:1' },
    resolution: [1080, 1080],
    maxDurationSeconds: null,
    minDurationSeconds: null,
    maxFileSizeBytes: 5 * 1024 * 1024,
    requiredSourceTypes: [],
    minAssets: 1,
    supportsLogo: true,
    ctaMode: 'simple',
    channel: 'Instagram / Facebook',
  },

  blog: {
    format: 'blog' as OutputFormat,
    label: 'Artigo de Blog',
    aspectRatio: { width: 16, height: 9, label: '16:9' },
    resolution: [1200, 675],
    maxDurationSeconds: null,
    minDurationSeconds: null,
    maxFileSizeBytes: 0,
    requiredSourceTypes: ['hero' as SourceType],
    minAssets: 3,
    supportsLogo: false,
    ctaMode: 'full',
    channel: 'Blog / Medium',
  },

  landing_page: {
    format: 'landing_page' as OutputFormat,
    label: 'Landing Page',
    aspectRatio: { width: 16, height: 9, label: '16:9' },
    resolution: [1920, 1080],
    maxDurationSeconds: null,
    minDurationSeconds: null,
    maxFileSizeBytes: 3 * 1024 * 1024,
    requiredSourceTypes: ['hero' as SourceType],
    minAssets: 5,
    supportsLogo: true,
    ctaMode: 'form',
    channel: 'Tráfego pago / Links bio',
  },

  presentation: {
    format: 'presentation' as OutputFormat,
    label: 'Apresentação',
    aspectRatio: { width: 16, height: 9, label: '16:9' },
    resolution: [1920, 1080],
    maxDurationSeconds: null,
    minDurationSeconds: null,
    maxFileSizeBytes: 20 * 1024 * 1024,
    requiredSourceTypes: ['hero' as SourceType],
    minAssets: 6,
    supportsLogo: true,
    ctaMode: 'full',
    channel: 'Reunião / Videoconferência',
  },

  audio_monologue: {
    format: 'audio_monologue' as OutputFormat,
    label: 'Áudio Monólogo',
    aspectRatio: { width: 1, height: 1, label: '1:1' },
    resolution: [0, 0],
    maxDurationSeconds: 300,
    minDurationSeconds: 60,
    maxFileSizeBytes: 10 * 1024 * 1024,
    requiredSourceTypes: [],
    minAssets: 0,
    supportsLogo: false,
    ctaMode: 'simple',
    channel: 'WhatsApp / Podcast',
  },

  audio_podcast: {
    format: 'audio_podcast' as OutputFormat,
    label: 'Áudio Podcast',
    aspectRatio: { width: 1, height: 1, label: '1:1' },
    resolution: [0, 0],
    maxDurationSeconds: 900,
    minDurationSeconds: 300,
    maxFileSizeBytes: 20 * 1024 * 1024,
    requiredSourceTypes: [],
    minAssets: 0,
    supportsLogo: false,
    ctaMode: 'simple',
    channel: 'Spotify / Apple Podcasts',
  },
};
