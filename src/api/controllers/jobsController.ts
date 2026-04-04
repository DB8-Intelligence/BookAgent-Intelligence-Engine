/**
 * Controller: Jobs
 *
 * Consulta de jobs, status, resultados, fontes e planos.
 *
 * Endpoints:
 *   GET /jobs           — Lista todos os jobs
 *   GET /jobs/:jobId    — Detalhe de um job com resumo de resultados
 *   GET /jobs/:jobId/sources — Lista sources geradas
 *   GET /jobs/:jobId/plans   — Lista planos (media, blog, LP)
 */

import type { Request, Response } from 'express';
import { Orchestrator } from '../../core/orchestrator.js';
import { sendSuccess, sendError } from '../helpers/response.js';
import type {
  JobStatusResponse,
  JobListItem,
  OutputSummary,
  SourceListItem,
  PlanListItem,
} from '../types/responses.js';

let orchestrator: Orchestrator;

export function setOrchestrator(orch: Orchestrator): void {
  orchestrator = orch;
}

/**
 * GET /jobs — Lista todos os jobs registrados.
 */
export function listJobs(_req: Request, res: Response): void {
  const jobs = orchestrator.listJobs();

  const data: JobListItem[] = jobs.map((job) => ({
    job_id: job.id,
    status: job.status,
    type: job.input.type,
    created_at: job.createdAt.toISOString(),
    updated_at: job.updatedAt.toISOString(),
  }));

  sendSuccess(res, data);
}

/**
 * GET /jobs/:jobId — Detalhe de um job com resumo de outputs.
 */
export function getJobDetail(req: Request, res: Response): void {
  const { jobId } = req.params;
  const job = orchestrator.getJobStatus(jobId);

  if (!job) {
    sendError(res, 'NOT_FOUND', 'Job não encontrado', 404);
    return;
  }

  let outputSummary: OutputSummary | undefined;

  if (job.result) {
    const r = job.result;
    outputSummary = {
      source_count: r.sources.length,
      selected_outputs: r.selectedOutputs?.length ?? 0,
      media_plans: r.mediaPlans?.length ?? 0,
      blog_plans: r.blogPlans?.length ?? 0,
      landing_page_plans: r.landingPagePlans?.length ?? 0,
      artifacts: r.exportResult?.totalArtifacts ?? 0,
    };
  }

  const data: JobStatusResponse = {
    job_id: job.id,
    status: job.status,
    input: {
      file_url: job.input.fileUrl,
      type: job.input.type,
    },
    created_at: job.createdAt.toISOString(),
    updated_at: job.updatedAt.toISOString(),
    has_result: !!job.result,
    output_summary: outputSummary,
    error: job.error,
  };

  sendSuccess(res, data);
}

/**
 * GET /jobs/:jobId/sources — Lista as sources geradas pelo job.
 */
export function getJobSources(req: Request, res: Response): void {
  const { jobId } = req.params;
  const job = orchestrator.getJobStatus(jobId);

  if (!job) {
    sendError(res, 'NOT_FOUND', 'Job não encontrado', 404);
    return;
  }

  if (!job.result) {
    sendError(res, 'NOT_READY', 'Job ainda não concluído', 409);
    return;
  }

  const data: SourceListItem[] = job.result.sources.map((s) => ({
    id: s.id,
    type: s.type,
    title: s.title,
    summary: s.summary,
    confidence_score: s.confidenceScore,
    asset_count: s.assetIds.length,
    priority: s.priority,
    narrative_role: s.narrativeRole,
    commercial_role: s.commercialRole,
  }));

  sendSuccess(res, data);
}

/**
 * GET /jobs/:jobId/plans — Lista todos os planos gerados pelo job.
 */
export function getJobPlans(req: Request, res: Response): void {
  const { jobId } = req.params;
  const job = orchestrator.getJobStatus(jobId);

  if (!job) {
    sendError(res, 'NOT_FOUND', 'Job não encontrado', 404);
    return;
  }

  if (!job.result) {
    sendError(res, 'NOT_READY', 'Job ainda não concluído', 409);
    return;
  }

  const plans: PlanListItem[] = [];

  // Media plans
  for (const mp of job.result.mediaPlans ?? []) {
    plans.push({
      id: mp.id,
      plan_type: 'media',
      format: mp.format,
      title: mp.title,
      status: mp.renderStatus,
      confidence: undefined,
    });
  }

  // Blog plans
  for (const bp of job.result.blogPlans ?? []) {
    plans.push({
      id: bp.id,
      plan_type: 'blog',
      format: 'blog',
      title: bp.title,
      confidence: bp.confidence,
    });
  }

  // Landing page plans
  for (const lp of job.result.landingPagePlans ?? []) {
    plans.push({
      id: lp.id,
      plan_type: 'landing-page',
      format: 'landing_page',
      title: lp.title,
      confidence: lp.confidence,
    });
  }

  sendSuccess(res, plans);
}
