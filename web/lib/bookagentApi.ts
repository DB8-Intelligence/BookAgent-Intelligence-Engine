/**
 * bookagentApi.ts — Typed API Client for BookAgent Intelligence Engine
 *
 * Complete client covering all backend contracts.
 * All responses follow the envelope { success, data?, error?, meta }.
 *
 * Usage:
 *   import { bookagent } from "@/lib/bookagentApi";
 *   const job = await bookagent.jobs.get("uuid");
 *   const artifacts = await bookagent.jobs.artifacts("uuid");
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const API_PREFIX = "/api/v1";

// ============================================================================
// Response Envelope
// ============================================================================

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
  meta: { timestamp: string; version: string; requestId?: string };
}

export class BookAgentApiError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "BookAgentApiError";
    this.code = code;
    this.details = details;
  }
}

// ============================================================================
// Core Types
// ============================================================================

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export type InputType = "pdf" | "video" | "audio" | "pptx" | "document";

export type ArtifactType =
  | "media-render-spec"
  | "blog-article"
  | "landing-page"
  | "media-metadata";

export type ExportFormat = "json" | "html" | "markdown" | "render-spec";

export type ArtifactStatus = "valid" | "partial" | "invalid";

export type RenderStatus =
  | "ready"
  | "partial"
  | "needs-assets"
  | "needs-text"
  | "not-ready";

export type PlanType = "media" | "blog" | "landing-page";

// ============================================================================
// DTOs — Process
// ============================================================================

export interface UserContext {
  name?: string;
  whatsapp?: string;
  instagram?: string;
  site?: string;
  region?: string;
  logo_url?: string;
}

export interface ProcessInput {
  file_url: string;
  type: InputType;
  user_context?: UserContext;
  webhook_url?: string;
}

export interface ProcessResult {
  job_id: string;
  status: JobStatus;
  message: string;
}

// ============================================================================
// DTOs — Jobs
// ============================================================================

export interface JobListItem {
  job_id: string;
  status: JobStatus;
  type: string;
  created_at: string;
  updated_at: string;
}

export interface OutputSummary {
  source_count: number;
  selected_outputs: number;
  media_plans: number;
  blog_plans: number;
  landing_page_plans: number;
  artifacts: number;
}

export interface JobDetail {
  job_id: string;
  status: JobStatus;
  input: { file_url: string; type: string };
  created_at: string;
  updated_at: string;
  has_result: boolean;
  output_summary?: OutputSummary;
  error?: string;
}

// ============================================================================
// DTOs — Sources
// ============================================================================

export interface SourceItem {
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

// ============================================================================
// DTOs — Plans
// ============================================================================

export interface PlanItem {
  id: string;
  plan_type: PlanType;
  format: string;
  title: string;
  status?: RenderStatus | string;
  confidence?: number;
}

// ============================================================================
// DTOs — Artifacts
// ============================================================================

export interface ArtifactListItem {
  id: string;
  artifact_type: ArtifactType | string;
  export_format: ExportFormat | string;
  output_format: string;
  title: string;
  size_bytes: number;
  status: ArtifactStatus | string;
  warnings: string[];
  referenced_asset_count: number;
  created_at: string;
}

export interface ArtifactDetail extends ArtifactListItem {
  content: string;
  referenced_asset_ids: string[];
  plan_id: string;
}

// ============================================================================
// DTOs — Health
// ============================================================================

export interface HealthResponse {
  status: string;
  engine: string;
  version: string;
  uptime: number;
  persistence: { mode: string; supabase: boolean };
  queue: { mode: string; enabled: boolean };
  providers: {
    ai: { provider: string; available: boolean };
    tts: { provider: string; available: boolean };
  };
}

// ============================================================================
// DTOs — Ops / Co-Pilot (optional, for admin pages)
// ============================================================================

export interface CoPilotOverview {
  executiveSummary: {
    overallHealth: "healthy" | "warning" | "critical";
    headline: string;
    kpis: Record<string, number | string>;
    trend: string;
  };
  operationalSummary: {
    activeCampaigns: number;
    avgCampaignProgress: number;
    recentPublications: number;
    pendingDecisions: number;
    stuckStates: number;
    billingUtilization: number;
  };
  bundle: {
    totalActive: number;
    totalCritical: number;
    totalHigh: number;
  };
}

// ============================================================================
// Fetch Core
// ============================================================================

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${BASE_URL}${API_PREFIX}${path}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  // Handle non-JSON responses (e.g., download)
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (!res.ok) throw new BookAgentApiError("HTTP_ERROR", `HTTP ${res.status}`);
    return res as unknown as T;
  }

  const json = (await res.json()) as ApiEnvelope<T>;

  if (!json.success || json.data === undefined) {
    throw new BookAgentApiError(
      json.error?.code ?? "UNKNOWN",
      json.error?.message ?? `API error ${res.status}`,
      json.error?.details,
    );
  }

  return json.data;
}

// ============================================================================
// Namespaced Client
// ============================================================================

export const bookagent = {
  // ---------- Health ----------
  health: () => request<HealthResponse>("/health".replace(API_PREFIX, "")),

  // ---------- Process ----------
  process: {
    start: (input: ProcessInput) =>
      request<ProcessResult>("/process", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },

  // ---------- Jobs ----------
  jobs: {
    list: () => request<JobListItem[]>("/jobs"),

    get: (jobId: string) => request<JobDetail>(`/jobs/${jobId}`),

    sources: (jobId: string) => request<SourceItem[]>(`/jobs/${jobId}/sources`),

    plans: (jobId: string) => request<PlanItem[]>(`/jobs/${jobId}/plans`),

    artifacts: (jobId: string, filters?: { type?: string; format?: string }) => {
      const params = new URLSearchParams();
      if (filters?.type) params.set("type", filters.type);
      if (filters?.format) params.set("format", filters.format);
      const qs = params.toString();
      return request<ArtifactListItem[]>(`/jobs/${jobId}/artifacts${qs ? `?${qs}` : ""}`);
    },

    artifact: (jobId: string, artifactId: string) =>
      request<ArtifactDetail>(`/jobs/${jobId}/artifacts/${artifactId}`),

    downloadUrl: (jobId: string, artifactId: string) =>
      `${BASE_URL}${API_PREFIX}/jobs/${jobId}/artifacts/${artifactId}/download`,
  },

  // ---------- Co-Pilot ----------
  copilot: {
    overview: () => request<CoPilotOverview>("/copilot/overview"),
  },

  // ---------- Ops ----------
  ops: {
    dashboard: () => request<Record<string, unknown>>("/ops/dashboard"),
    queue: () => request<Record<string, unknown>>("/ops/queue"),
  },
};

// ============================================================================
// Helpers
// ============================================================================

/** Format file size to human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Time elapsed since ISO date string */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Map artifact type to display icon */
export const ARTIFACT_ICONS: Record<string, string> = {
  "media-render-spec": "🎬",
  "blog-article": "✍️",
  "landing-page": "🌐",
  "media-metadata": "📋",
};

/** Map export format to label */
export const FORMAT_LABELS: Record<string, string> = {
  json: "JSON",
  html: "HTML",
  markdown: "Markdown",
  "render-spec": "Render Spec",
};

/** Map job status to display config */
export const JOB_STATUS_CONFIG: Record<
  JobStatus,
  { label: string; color: string; bg: string }
> = {
  pending: {
    label: "Pendente",
    color: "text-blue-500",
    bg: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  },
  processing: {
    label: "Processando",
    color: "text-amber-500",
    bg: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
  completed: {
    label: "Concluido",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  },
  failed: {
    label: "Falhou",
    color: "text-red-500",
    bg: "bg-red-500/10 text-red-500 border-red-500/20",
  },
};

/** Pipeline stage names (17 stages) */
export const PIPELINE_STAGES = [
  { id: 1, name: "Ingestion", icon: "📥", desc: "Extrair texto do arquivo" },
  { id: 2, name: "Book Analysis", icon: "📖", desc: "Analisar compatibilidade" },
  { id: 3, name: "Reverse Engineering", icon: "🔍", desc: "Engenharia reversa editorial" },
  { id: 4, name: "Asset Extraction", icon: "🖼️", desc: "Extrair imagens e assets" },
  { id: 5, name: "Branding", icon: "🎨", desc: "Identificar cores e estilo" },
  { id: 6, name: "Correlation", icon: "🔗", desc: "Vincular texto e imagem" },
  { id: 7, name: "Source Intelligence", icon: "🧠", desc: "Classificar fontes" },
  { id: 8, name: "Narrative", icon: "📝", desc: "Gerar narrativas" },
  { id: 9, name: "Output Selection", icon: "✅", desc: "Selecionar formatos viaveis" },
  { id: 10, name: "Media Generation", icon: "🎬", desc: "Gerar media plans" },
  { id: 11, name: "Blog", icon: "✍️", desc: "Gerar artigos" },
  { id: 12, name: "Landing Page", icon: "🌐", desc: "Gerar landing pages" },
  { id: 13, name: "Personalization", icon: "👤", desc: "Aplicar logo e CTA" },
  { id: 14, name: "Content Scoring", icon: "⭐", desc: "Avaliar qualidade" },
  { id: 15, name: "Render/Export", icon: "📦", desc: "Exportar artefatos" },
  { id: 16, name: "Delivery", icon: "🚀", desc: "Preparar entrega" },
  { id: 17, name: "Performance", icon: "📊", desc: "Metricas e custos" },
] as const;
