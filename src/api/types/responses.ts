/**
 * API Response Types
 *
 * Tipos padronizados para todas as respostas da API.
 * Garante envelope consistente e contratos estáveis para integradores.
 */

import type { JobStatus, OutputFormat } from '../../domain/value-objects/index.js';
import type { ExportFormat, ArtifactType, ArtifactStatus } from '../../domain/entities/export-artifact.js';

// ---------------------------------------------------------------------------
// Envelope padrão
// ---------------------------------------------------------------------------

/** Envelope padrão de resposta da API */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiMeta {
  timestamp: string;
  version: string;
  requestId?: string;
}

// ---------------------------------------------------------------------------
// Process
// ---------------------------------------------------------------------------

/** POST /process — Response */
export interface ProcessResponse {
  job_id: string;
  status: JobStatus;
  message: string;
}

// ---------------------------------------------------------------------------
// Job Status
// ---------------------------------------------------------------------------

/** GET /jobs/:jobId — Response */
export interface JobStatusResponse {
  job_id: string;
  status: JobStatus;
  input: {
    file_url: string;
    type: string;
  };
  created_at: string;
  updated_at: string;
  has_result: boolean;
  output_summary?: OutputSummary;
  error?: string;
}

export interface OutputSummary {
  source_count: number;
  selected_outputs: number;
  media_plans: number;
  blog_plans: number;
  landing_page_plans: number;
  artifacts: number;
}

// ---------------------------------------------------------------------------
// Jobs List
// ---------------------------------------------------------------------------

/** GET /jobs — Response */
export interface JobListItem {
  job_id: string;
  status: JobStatus;
  type: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

/** GET /jobs/:jobId/artifacts — Response */
export interface ArtifactListItem {
  id: string;
  artifact_type: ArtifactType;
  export_format: ExportFormat;
  output_format: OutputFormat;
  title: string;
  size_bytes: number;
  status: ArtifactStatus;
  warnings: string[];
  referenced_asset_count: number;
  created_at: string;
}

/** GET /jobs/:jobId/artifacts/:artifactId — Response */
export interface ArtifactDetailResponse {
  id: string;
  artifact_type: ArtifactType;
  export_format: ExportFormat;
  output_format: OutputFormat;
  title: string;
  content: string;
  size_bytes: number;
  status: ArtifactStatus;
  warnings: string[];
  referenced_asset_ids: string[];
  plan_id: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/** GET /jobs/:jobId/sources — Response */
export interface SourceListItem {
  id: string;
  type: string;
  title: string;
  summary?: string;
  confidence_score: number;
  asset_count: number;
  priority: number;
  narrative_role?: string;
  commercial_role?: string;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

/** GET /jobs/:jobId/plans — Response */
export interface PlanListItem {
  id: string;
  plan_type: 'media' | 'blog' | 'landing-page';
  format: string;
  title: string;
  status?: string;
  confidence?: number;
}
