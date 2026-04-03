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
