/**
 * BookAgent Intelligence Engine — Tipos globais
 *
 * Definições de tipos compartilhados entre todos os módulos do sistema.
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

// ---------------------------------------------------------------------------
// Core Interfaces
// ---------------------------------------------------------------------------

export interface JobInput {
  fileUrl: string;
  type: InputType;
  userContext: UserContext;
}

export interface UserContext {
  name?: string;
  whatsapp?: string;
  instagram?: string;
  site?: string;
  region?: string;
  logoUrl?: string;
}

export interface Job {
  id: string;
  status: JobStatus;
  input: JobInput;
  createdAt: Date;
  updatedAt: Date;
  result?: JobResult;
  error?: string;
}

export interface JobResult {
  jobId: string;
  sources: Source[];
  outputs: GeneratedOutput[];
  branding: BrandingProfile;
}

// ---------------------------------------------------------------------------
// Source Model
// ---------------------------------------------------------------------------

export interface Source {
  id: string;
  type: SourceType;
  title: string;
  description: string;
  images: SourceAsset[];
  tags: string[];
  confidenceScore: number;
  sourcePage?: number;
  brandingContext?: BrandingContext;
}

export interface SourceAsset {
  id: string;
  filePath: string;
  thumbnailPath?: string;
  width: number;
  height: number;
  page: number;
  position?: { x: number; y: number };
  classification?: SourceType;
}

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

export interface BrandingProfile {
  colors: ColorPalette;
  style: string;
  composition: string;
}

export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface BrandingContext {
  colors: ColorPalette;
  style: string;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface GeneratedOutput {
  id: string;
  format: OutputFormat;
  filePath: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

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

export interface PipelineContext {
  jobId: string;
  input: JobInput;
  extractedText?: string;
  assets?: SourceAsset[];
  sources?: Source[];
  branding?: BrandingProfile;
  narratives?: Record<string, string>;
  selectedOutputs?: OutputFormat[];
  outputs?: GeneratedOutput[];
}
