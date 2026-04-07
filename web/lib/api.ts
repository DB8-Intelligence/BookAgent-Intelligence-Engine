/**
 * BookAgent API Client
 *
 * Typed client matching the backend API envelope:
 * { success, data?, error?, meta }
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const PREFIX = "/api/v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
  meta: { timestamp: string; version: string; requestId?: string };
}

export type JobStatus = "pending" | "processing" | "completed" | "failed";
export type InputType = "pdf" | "video" | "audio" | "pptx" | "document";

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

export interface JobListItem {
  job_id: string;
  status: JobStatus;
  type: string;
  created_at: string;
  updated_at: string;
}

export interface JobDetail {
  job_id: string;
  status: JobStatus;
  input: { file_url: string; type: string };
  created_at: string;
  updated_at: string;
  has_result: boolean;
  output_summary?: {
    source_count: number;
    selected_outputs: number;
    media_plans: number;
    blog_plans: number;
    landing_page_plans: number;
    artifacts: number;
  };
  error?: string;
}

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

export interface PlanItem {
  id: string;
  plan_type: "media" | "blog" | "landing-page";
  format: string;
  title: string;
  status?: string;
  confidence?: number;
}

export interface ArtifactListItem {
  id: string;
  artifact_type: string;
  export_format: string;
  output_format: string;
  title: string;
  size_bytes: number;
  status: string;
  warnings: string[];
  referenced_asset_count: number;
  created_at: string;
}

export interface ArtifactDetail extends ArtifactListItem {
  content: string;
  referenced_asset_ids: string[];
  plan_id: string;
}

// ---------------------------------------------------------------------------
// Fetch wrapper
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${PREFIX}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success || !json.data) {
    throw new Error(json.error?.message ?? `API error ${res.status}`);
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export async function startProcess(input: ProcessInput): Promise<ProcessResult> {
  return apiFetch<ProcessResult>("/process", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listJobs(): Promise<JobListItem[]> {
  return apiFetch<JobListItem[]>("/jobs");
}

export async function getJob(jobId: string): Promise<JobDetail> {
  return apiFetch<JobDetail>(`/jobs/${jobId}`);
}

export async function getJobSources(jobId: string): Promise<SourceItem[]> {
  return apiFetch<SourceItem[]>(`/jobs/${jobId}/sources`);
}

export async function getJobPlans(jobId: string): Promise<PlanItem[]> {
  return apiFetch<PlanItem[]>(`/jobs/${jobId}/plans`);
}

export async function getJobArtifacts(jobId: string): Promise<ArtifactListItem[]> {
  return apiFetch<ArtifactListItem[]>(`/jobs/${jobId}/artifacts`);
}

export async function getArtifact(jobId: string, artifactId: string): Promise<ArtifactDetail> {
  return apiFetch<ArtifactDetail>(`/jobs/${jobId}/artifacts/${artifactId}`);
}

export function getDownloadUrl(jobId: string, artifactId: string): string {
  return `${BASE}${PREFIX}/jobs/${jobId}/artifacts/${artifactId}/download`;
}
