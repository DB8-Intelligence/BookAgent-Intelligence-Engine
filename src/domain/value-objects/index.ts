/**
 * Value Objects — Objetos de valor imutáveis do domínio.
 *
 * Value Objects não têm identidade própria. São definidos
 * exclusivamente pelo seu conteúdo (ex: uma cor, uma paleta, uma posição).
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum InputType {
  PDF = 'pdf',
  VIDEO = 'video',
  AUDIO = 'audio',
  PPTX = 'pptx',
  DOCUMENT = 'document',
}

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum SourceType {
  HERO = 'hero',
  LIFESTYLE = 'lifestyle',
  DIFERENCIAL = 'diferencial',
  INFRAESTRUTURA = 'infraestrutura',
  PLANTA = 'planta',
  COMPARATIVO = 'comparativo',
  INVESTIMENTO = 'investimento',
  CTA = 'cta',
  INSTITUCIONAL = 'institucional',
  EDITORIAL = 'editorial',
}

export enum OutputFormat {
  REEL = 'reel',
  VIDEO_SHORT = 'video_short',
  VIDEO_LONG = 'video_long',
  STORY = 'story',
  CAROUSEL = 'carousel',
  POST = 'post',
  BLOG = 'blog',
  LANDING_PAGE = 'landing_page',
  PRESENTATION = 'presentation',
  AUDIO_MONOLOGUE = 'audio_monologue',
  AUDIO_PODCAST = 'audio_podcast',
}

export enum PipelineStage {
  INGESTION = 'ingestion',
  EXTRACTION = 'extraction',
  CORRELATION = 'correlation',
  BRANDING = 'branding',
  SOURCE_INTELLIGENCE = 'source_intelligence',
  NARRATIVE = 'narrative',
  OUTPUT_SELECTION = 'output_selection',
  MEDIA_GENERATION = 'media_generation',
  PERSONALIZATION = 'personalization',
  RENDER_EXPORT = 'render_export',
}

/** Origem de um asset no sistema */
export enum AssetOrigin {
  PDF_EXTRACTED = 'pdf-extracted',
  PAGE_RENDER = 'page-render',
  VIDEO_FRAME = 'video-frame',
  PPTX_SLIDE = 'pptx-slide',
  UPLOADED = 'uploaded',
}

/** Papel de uma fonte na narrativa comercial */
export enum NarrativeRole {
  HOOK = 'hook',
  SHOWCASE = 'showcase',
  DIFFERENTIATOR = 'differentiator',
  SOCIAL_PROOF = 'social-proof',
  CLOSING = 'closing',
  CONTEXT = 'context',
}

/** Papel de uma fonte na estratégia comercial */
export enum CommercialRole {
  LEAD_CAPTURE = 'lead-capture',
  OBJECTION_HANDLER = 'objection-handler',
  VALUE_PROPOSITION = 'value-proposition',
  URGENCY = 'urgency',
  AUTHORITY = 'authority',
  TRUST = 'trust',
}

/** Status de execução de um módulo */
export enum ModuleStatus {
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
  SKIPPED = 'skipped',
}

/** Estilo visual identificado no material */
export enum VisualStyle {
  LUXURY_MODERN = 'luxury-modern',
  LUXURY_CLASSIC = 'luxury-classic',
  URBAN_MODERN = 'urban-modern',
  RESORT = 'resort',
  POPULAR = 'popular',
  CORPORATE = 'corporate',
  MINIMAL = 'minimal',
}

/** Intensidade visual do material */
export enum VisualIntensity {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

/** Nível de sofisticação visual do material */
export enum SophisticationLevel {
  PREMIUM = 'premium',
  STANDARD = 'standard',
  BASIC = 'basic',
}

// ---------------------------------------------------------------------------
// Value Objects
// ---------------------------------------------------------------------------

export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

/** Cor com frequência relativa (0-1) extraída de análise de imagem */
export interface DominantColor {
  hex: string;
  r: number;
  g: number;
  b: number;
  frequency: number;
  luminance: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface BoundingBox {
  position: Position;
  dimensions: Dimensions;
}

export interface AspectRatio {
  width: number;
  height: number;
  label: string;
}

/** Aspect ratios predefinidos para outputs */
export const ASPECT_RATIOS = {
  PORTRAIT_9_16: { width: 9, height: 16, label: '9:16' } as AspectRatio,
  SQUARE_1_1: { width: 1, height: 1, label: '1:1' } as AspectRatio,
  PORTRAIT_4_5: { width: 4, height: 5, label: '4:5' } as AspectRatio,
  LANDSCAPE_16_9: { width: 16, height: 9, label: '16:9' } as AspectRatio,
};
