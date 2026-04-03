/**
 * Entity: ExportArtifact
 *
 * Representa um artefato exportável gerado pelo Render/Export Engine.
 *
 * Cada artefato é o produto final de um plano (MediaPlan, BlogPlan,
 * LandingPagePlan) serializado para um formato consumível:
 * - JSON (dados estruturados para renderização externa)
 * - HTML (landing pages, blog posts)
 * - Markdown (blog posts para CMS)
 * - RENDER_SPEC (especificação técnica para motor de vídeo/image)
 *
 * O artefato contém metadados de rastreabilidade (planId, format,
 * narrativeType) e o conteúdo serializado pronto para uso.
 */

import type { OutputFormat } from '../value-objects/index.js';
import type { NarrativeType } from './narrative.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Formato de exportação do artefato */
export enum ExportFormat {
  JSON = 'json',                 // Dados estruturados para renderização
  HTML = 'html',                 // HTML pronto para publicação
  MARKDOWN = 'markdown',         // Markdown para CMS/blog engines
  RENDER_SPEC = 'render-spec',   // Especificação técnica de renderização (vídeo/imagem)
}

/** Tipo de artefato (alinhado com o tipo de plano de origem) */
export enum ArtifactType {
  MEDIA_RENDER_SPEC = 'media-render-spec',     // Spec de renderização de vídeo/imagem
  BLOG_ARTICLE = 'blog-article',               // Artigo de blog completo
  LANDING_PAGE = 'landing-page',               // Landing page completa
  MEDIA_METADATA = 'media-metadata',           // Metadados de mídia (captions, tags)
}

/** Status de validação do artefato */
export enum ArtifactStatus {
  VALID = 'valid',           // Artefato completo e válido
  PARTIAL = 'partial',       // Artefato gerado mas com lacunas
  INVALID = 'invalid',       // Artefato inválido (dados insuficientes)
}

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface ExportArtifact {
  /** Identificador único do artefato */
  id: string;

  /** Tipo do artefato */
  artifactType: ArtifactType;

  /** Formato de exportação */
  exportFormat: ExportFormat;

  /** Formato de output de origem (reel, blog, landing_page, etc.) */
  outputFormat: OutputFormat;

  /** Tipo de narrativa de origem */
  narrativeType: NarrativeType;

  /** ID do plano de origem (MediaPlan, BlogPlan ou LandingPagePlan) */
  planId: string;

  /** Título legível do artefato */
  title: string;

  /** Conteúdo serializado (JSON string, HTML, Markdown, etc.) */
  content: string;

  /** Tamanho do conteúdo em bytes */
  sizeBytes: number;

  /** Caminho onde o artefato foi salvo (se persistido) */
  filePath?: string;

  /** Status de validação */
  status: ArtifactStatus;

  /** Warnings gerados durante a exportação */
  warnings: string[];

  /** IDs dos assets referenciados */
  referencedAssetIds: string[];

  /** Data de criação */
  createdAt: Date;
}

/** Resultado consolidado da exportação */
export interface ExportResult {
  /** Total de artefatos gerados */
  totalArtifacts: number;

  /** Artefatos por tipo */
  mediaSpecs: number;
  blogArticles: number;
  landingPages: number;

  /** Artefatos com warnings */
  withWarnings: number;

  /** Artefatos inválidos (não gerados) */
  invalid: number;

  /** Lista de artefatos */
  artifacts: ExportArtifact[];
}
