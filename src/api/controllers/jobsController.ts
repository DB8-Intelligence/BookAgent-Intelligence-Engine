/**
 * Controller: Jobs
 *
 * Consulta de jobs, status, resultados, fontes e planos.
 *
 * Estratégia de leitura (dois modos):
 *
 * IN-MEMORY:  orchestrator.getJobStatus(jobId) — jobs da sessão atual
 * DB FALLBACK: JobRepository.getJob(jobId) — jobs persistidos no Supabase
 *              Ativado quando job não está em memória (modo fila/async)
 *
 * Endpoints:
 *   GET /jobs           — Lista todos os jobs
 *   GET /jobs/:jobId    — Detalhe de um job com resumo de resultados
 *   GET /jobs/:jobId/sources — Lista sources geradas
 *   GET /jobs/:jobId/plans   — Lista planos (media, blog, LP)
 */

import type { Request, Response } from 'express';
import type { IOrchestratorLike } from '../types/orchestrator.js';
import type { JobRepository, JobRow, ArtifactCounts } from '../../persistence/job-repository.js';
import { sendSuccess, sendError } from '../helpers/response.js';
import type {
  JobStatusResponse,
  JobListItem,
  OutputSummary,
  SourceListItem,
  PlanListItem,
} from '../types/responses.js';
import type { JobStatus } from '../../domain/value-objects/index.js';

let orchestrator: IOrchestratorLike;
let jobRepository: JobRepository | null = null;

export function setOrchestrator(orch: IOrchestratorLike): void {
  orchestrator = orch;
}

/**
 * Injeta o JobRepository para fallback de leitura no Supabase.
 * Chamado pelo bootstrap quando Supabase estiver configurado.
 */
export function setJobRepository(repo: JobRepository): void {
  jobRepository = repo;
}

// ---------------------------------------------------------------------------
// GET /jobs — Lista todos os jobs
// ---------------------------------------------------------------------------

export async function listJobs(_req: Request, res: Response): Promise<void> {
  // Jobs in-memory (sessão atual)
  const memJobs = orchestrator.listJobs();

  // Se não há jobs em memória e Supabase configurado, consultar DB
  if (memJobs.length === 0 && jobRepository) {
    try {
      const dbJobs = await jobRepository.listJobs(50);
      const data: JobListItem[] = dbJobs.map(jobRowToListItem);
      sendSuccess(res, data);
      return;
    } catch {
      // Fallback silencioso — retornar lista vazia
    }
  }

  const data: JobListItem[] = memJobs.map((job) => ({
    job_id:     job.id,
    status:     job.status,
    type:       job.input.type,
    created_at: job.createdAt.toISOString(),
    updated_at: job.updatedAt.toISOString(),
  }));

  sendSuccess(res, data);
}

// ---------------------------------------------------------------------------
// GET /jobs/:jobId — Detalhe de um job
// ---------------------------------------------------------------------------

export async function getJobDetail(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  // 1. Tentar em memória primeiro (mais rápido)
  const memJob = orchestrator.getJobStatus(jobId);

  if (memJob) {
    let outputSummary: OutputSummary | undefined;

    if (memJob.result) {
      const r = memJob.result;
      outputSummary = {
        source_count:       r.sources.length,
        selected_outputs:   r.selectedOutputs?.length ?? 0,
        media_plans:        r.mediaPlans?.length ?? 0,
        blog_plans:         r.blogPlans?.length ?? 0,
        landing_page_plans: r.landingPagePlans?.length ?? 0,
        artifacts:          r.exportResult?.totalArtifacts ?? 0,
      };
    }

    const data: JobStatusResponse = {
      job_id:        memJob.id,
      status:        memJob.status,
      input: {
        file_url: memJob.input.fileUrl,
        type:     memJob.input.type,
      },
      created_at:    memJob.createdAt.toISOString(),
      updated_at:    memJob.updatedAt.toISOString(),
      has_result:    !!memJob.result,
      output_summary: outputSummary,
      error:         memJob.error,
    };

    sendSuccess(res, data);
    return;
  }

  // 2. Fallback para Supabase (jobs de sessões anteriores ou modo fila)
  if (jobRepository) {
    try {
      const dbJob = await jobRepository.getJob(jobId);

      if (dbJob) {
        // Count plans from artifacts table for accurate output_summary
        const artifactCounts = await countArtifactsByType(jobId);
        sendSuccess(res, jobRowToStatusResponse(dbJob, artifactCounts));
        return;
      }
    } catch {
      // Continuar para 404
    }
  }

  sendError(res, 'NOT_FOUND', 'Job não encontrado', 404);
}

// ---------------------------------------------------------------------------
// GET /jobs/:jobId/sources
// ---------------------------------------------------------------------------

export function getJobSources(req: Request, res: Response): void {
  const { jobId } = req.params;
  const job = orchestrator.getJobStatus(jobId);

  if (!job) {
    sendError(res, 'NOT_FOUND', 'Job não encontrado (sources disponíveis apenas para jobs em memória)', 404);
    return;
  }

  if (!job.result) {
    sendError(res, 'NOT_READY', 'Job ainda não concluído', 409);
    return;
  }

  const data: SourceListItem[] = job.result.sources.map((s) => ({
    id:               s.id,
    type:             s.type,
    title:            s.title,
    summary:          s.summary,
    confidence_score: s.confidenceScore,
    asset_count:      s.assetIds.length,
    priority:         s.priority,
    narrative_role:   s.narrativeRole,
    commercial_role:  s.commercialRole,
  }));

  sendSuccess(res, data);
}

// ---------------------------------------------------------------------------
// GET /jobs/:jobId/plans
// ---------------------------------------------------------------------------

export function getJobPlans(req: Request, res: Response): void {
  const { jobId } = req.params;
  const job = orchestrator.getJobStatus(jobId);

  if (!job) {
    sendError(res, 'NOT_FOUND', 'Job não encontrado (plans disponíveis apenas para jobs em memória)', 404);
    return;
  }

  if (!job.result) {
    sendError(res, 'NOT_READY', 'Job ainda não concluído', 409);
    return;
  }

  const plans: PlanListItem[] = [];

  for (const mp of job.result.mediaPlans ?? []) {
    plans.push({ id: mp.id, plan_type: 'media', format: mp.format, title: mp.title, status: mp.renderStatus, confidence: undefined });
  }

  for (const bp of job.result.blogPlans ?? []) {
    plans.push({ id: bp.id, plan_type: 'blog', format: 'blog', title: bp.title, confidence: bp.confidence });
  }

  for (const lp of job.result.landingPagePlans ?? []) {
    plans.push({ id: lp.id, plan_type: 'landing-page', format: 'landing_page', title: lp.title, confidence: lp.confidence });
  }

  sendSuccess(res, plans);
}

// ---------------------------------------------------------------------------
// Mappers: DB row → API response
// ---------------------------------------------------------------------------

function jobRowToListItem(row: JobRow): JobListItem {
  return {
    job_id:     row.id,
    status:     row.status as JobStatus,
    type:       row.input_type,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function countArtifactsByType(jobId: string): Promise<ArtifactCounts | null> {
  if (!jobRepository) return null;
  try {
    return await jobRepository.countArtifactsByType(jobId);
  } catch {
    return null;
  }
}

function jobRowToStatusResponse(row: JobRow, artifactCounts?: ArtifactCounts | null): JobStatusResponse {
  const hasResult = row.status === 'completed';
  let outputSummary: OutputSummary | undefined;

  if (hasResult) {
    outputSummary = {
      source_count:       row.sources_count,
      selected_outputs:   artifactCounts?.selected_outputs ?? 0,
      media_plans:        artifactCounts?.media_plans ?? 0,
      blog_plans:         artifactCounts?.blog_plans ?? 0,
      landing_page_plans: artifactCounts?.landing_page_plans ?? 0,
      artifacts:          row.artifacts_count,
    };
  }

  return {
    job_id:         row.id,
    status:         row.status as JobStatus,
    input: {
      file_url: row.input_file_url,
      type:     row.input_type,
    },
    created_at:     row.created_at,
    updated_at:     row.updated_at,
    has_result:     hasResult,
    output_summary: outputSummary,
    error:          row.error ?? undefined,
  };
}
