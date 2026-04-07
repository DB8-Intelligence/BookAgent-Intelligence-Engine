/**
 * Entity: Thumbnail / CoverLayout / CoverStyle
 *
 * Estruturas para o Thumbnail/Cover Engine.
 *
 * - Thumbnail: resultado final (imagem gerada)
 * - CoverLayout: como elementos são posicionados na capa
 * - CoverStyle: estilo visual da capa (cores, tipografia)
 *
 * POLÍTICA DE PRESERVAÇÃO:
 * A imagem base (hero asset) é referenciada, nunca modificada.
 * O thumbnail é uma composição nova em camada separada.
 *
 * Parte 66: Thumbnail/Cover Engine
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Layout de posicionamento dos elementos na capa */
export enum CoverLayout {
  /** Asset full-bleed com texto overlay na parte inferior */
  FULL_BLEED_BOTTOM = 'full-bleed-bottom',
  /** Asset full-bleed com texto overlay central */
  FULL_BLEED_CENTER = 'full-bleed-center',
  /** Split: asset na metade superior, texto na inferior */
  SPLIT_TOP_IMAGE = 'split-top-image',
  /** Split: texto na metade superior, asset na inferior */
  SPLIT_BOTTOM_IMAGE = 'split-bottom-image',
  /** Fundo sólido com texto centralizado (sem asset) */
  TEXT_ONLY = 'text-only',
}

/** Formato de output do thumbnail */
export enum ThumbnailFormat {
  JPEG = 'jpeg',
  PNG = 'png',
  WEBP = 'webp',
}

/** Status de geração do thumbnail */
export enum ThumbnailStatus {
  PENDING = 'pending',
  GENERATED = 'generated',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/**
 * Estilo visual da capa — define cores, tipografia e overlay.
 */
export interface CoverStyle {
  /** Cor de fundo (hex) — usada em TEXT_ONLY ou como fallback */
  backgroundColor: string;

  /** Cor do texto principal (hex) */
  textColor: string;

  /** Cor de acento para CTA ou destaque (hex) */
  accentColor: string;

  /** Opacidade do scrim/gradiente sobre a imagem (0-1) */
  scrimOpacity: number;

  /** Cor do scrim (hex, tipicamente preto) */
  scrimColor: string;

  /** Tamanho da fonte do headline (px) */
  headlineFontSize: number;

  /** Tamanho da fonte do CTA (px) */
  ctaFontSize: number;

  /** Se deve exibir logo */
  showLogo: boolean;

  /** Qualidade de output JPEG (1-100) */
  jpegQuality: number;
}

/**
 * Especificação de um thumbnail a ser gerado.
 */
export interface ThumbnailSpec {
  /** Largura em pixels */
  width: number;

  /** Altura em pixels */
  height: number;

  /** Layout de posicionamento */
  layout: CoverLayout;

  /** Estilo visual */
  style: CoverStyle;

  /** Texto headline */
  headline: string;

  /** Texto CTA (opcional) */
  ctaText?: string;

  /** ID do asset base (hero image) */
  baseAssetId?: string;

  /** Caminho do asset base no disco */
  baseAssetPath?: string;

  /** Caminho do logo (opcional) */
  logoPath?: string;

  /** Formato de output */
  format: ThumbnailFormat;
}

/**
 * Resultado de um thumbnail gerado.
 */
export interface Thumbnail {
  /** ID único */
  id: string;

  /** ID do job de origem */
  jobId: string;

  /** ID do MediaPlan de origem */
  planId: string;

  /** Caminho do arquivo gerado */
  outputPath: string;

  /** Nome do arquivo */
  filename: string;

  /** Largura x Altura */
  resolution: [number, number];

  /** Formato do arquivo */
  format: ThumbnailFormat;

  /** Tamanho em bytes */
  sizeBytes: number;

  /** Layout usado */
  layout: CoverLayout;

  /** Status */
  status: ThumbnailStatus;

  /** Aspect ratio label (ex: '9:16', '1:1') */
  aspectRatio: string;

  /** Warnings durante geração */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Estilo padrão — dark scrim, texto branco, adequado para imobiliário */
export const DEFAULT_COVER_STYLE: CoverStyle = {
  backgroundColor: '#1a1a2e',
  textColor: '#FFFFFF',
  accentColor: '#c9a96e',
  scrimOpacity: 0.55,
  scrimColor: '#000000',
  headlineFontSize: 64,
  ctaFontSize: 36,
  showLogo: true,
  jpegQuality: 90,
};

/** Dimensões padrão de thumbnails */
export const THUMBNAIL_SIZES = {
  PORTRAIT: { width: 1080, height: 1920, label: '9:16' },
  SQUARE: { width: 1080, height: 1080, label: '1:1' },
  LANDSCAPE: { width: 1920, height: 1080, label: '16:9' },
} as const;
