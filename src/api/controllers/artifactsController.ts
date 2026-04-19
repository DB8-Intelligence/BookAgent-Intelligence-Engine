/**
 * Controller: Artifacts
 *
 * Consulta e download de artifacts exportados.
 *
 * Endpoints:
 *   GET /jobs/:jobId/artifacts              — Lista artifacts do job
 *   GET /jobs/:jobId/artifacts/:artifactId  — Detalhe com conteúdo
 *   GET /jobs/:jobId/artifacts/:artifactId/download — Download raw content
 */

import type { Request, Response } from 'express';
import type { IOrchestratorLike } from '../types/orchestrator.js';
import type { JobRepository } from '../../persistence/job-repository.js';
import { sendSuccess, sendError } from '../helpers/response.js';
import type { ArtifactListItem, ArtifactDetailResponse } from '../types/responses.js';
import { ExportFormat } from '../../domain/entities/export-artifact.js';
import type { ArtifactType, ArtifactStatus } from '../../domain/entities/export-artifact.js';
import type { OutputFormat } from '../../domain/value-objects/index.js';

let orchestrator: IOrchestratorLike;
let jobRepository: JobRepository | null = null;

export function setOrchestrator(orch: IOrchestratorLike): void {
  orchestrator = orch;
}

export function setArtifactsJobRepository(repo: JobRepository): void {
  jobRepository = repo;
}

// DB artifact row shape
interface ArtifactRow {
  id: string;
  artifact_type: string;
  export_format: string;
  output_format: string;
  title: string;
  file_path: string | null;
  size_bytes: number;
  status: string;
  warnings: unknown;
  referenced_asset_ids: unknown;
  created_at: string;
  content: unknown;
  content_url: string | null;
}

/**
 * GET /jobs/:jobId/artifacts — Lista artifacts do job.
 * Query params:
 *   ?type=media-render-spec  — Filtra por artifact type
 *   ?format=html             — Filtra por export format
 */
export async function listArtifacts(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;
  const typeFilter = req.query.type as string | undefined;
  const formatFilter = req.query.format as string | undefined;

  // 1. Try in-memory first
  const job = orchestrator.getJobStatus(jobId);

  if (job?.result?.exportResult) {
    let artifacts = job.result.exportResult.artifacts;

    if (typeFilter) artifacts = artifacts.filter((a) => a.artifactType === typeFilter);
    if (formatFilter) artifacts = artifacts.filter((a) => a.exportFormat === formatFilter);

    const data: ArtifactListItem[] = artifacts.map((a) => ({
      id: a.id,
      artifact_type: a.artifactType,
      export_format: a.exportFormat,
      output_format: a.outputFormat,
      title: a.title,
      size_bytes: a.sizeBytes,
      status: a.status,
      warnings: a.warnings,
      referenced_asset_count: a.referencedAssetIds.length,
      created_at: a.createdAt.toISOString(),
    }));

    sendSuccess(res, data);
    return;
  }

  // 2. Fallback to Supabase
  if (jobRepository) {
    try {
      const rows = await fetchArtifactRows(jobId);
      if (rows.length > 0) {
        let filtered = rows;
        if (typeFilter) filtered = filtered.filter((r) => r.artifact_type === typeFilter);
        if (formatFilter) filtered = filtered.filter((r) => r.export_format === formatFilter);

        const data: ArtifactListItem[] = filtered.map(artifactRowToListItem);
        sendSuccess(res, data);
        return;
      }
    } catch { /* fall through */ }
  }

  if (!job) {
    sendError(res, 'NOT_FOUND', 'Job não encontrado', 404);
  } else {
    sendError(res, 'NOT_READY', 'Job ainda não tem artifacts exportados', 409);
  }
}

/**
 * GET /jobs/:jobId/artifacts/:artifactId — Detalhe de um artifact com conteúdo.
 */
export async function getArtifactDetail(req: Request, res: Response): Promise<void> {
  const { jobId, artifactId } = req.params;

  // 1. Try in-memory
  const job = orchestrator.getJobStatus(jobId);

  if (job?.result?.exportResult) {
    const artifact = job.result.exportResult.artifacts.find((a) => a.id === artifactId);
    if (artifact) {
      const data: ArtifactDetailResponse = {
        id: artifact.id,
        artifact_type: artifact.artifactType,
        export_format: artifact.exportFormat,
        output_format: artifact.outputFormat,
        title: artifact.title,
        content: artifact.content,
        size_bytes: artifact.sizeBytes,
        status: artifact.status,
        warnings: artifact.warnings,
        referenced_asset_ids: artifact.referencedAssetIds,
        plan_id: artifact.planId,
        created_at: artifact.createdAt.toISOString(),
      };
      sendSuccess(res, data);
      return;
    }
  }

  // 2. Fallback to Supabase
  if (jobRepository) {
    try {
      const rows = await fetchArtifactRows(jobId);
      const row = rows.find((r) => r.id === artifactId);
      if (row) {
        const assetIds = Array.isArray(row.referenced_asset_ids) ? row.referenced_asset_ids as string[] : [];
        const data: ArtifactDetailResponse = {
          id: row.id,
          artifact_type: row.artifact_type as ArtifactType,
          export_format: row.export_format as ExportFormat,
          output_format: row.output_format as OutputFormat,
          title: row.title,
          content: row.content as string,
          size_bytes: row.size_bytes,
          status: row.status as ArtifactStatus,
          warnings: Array.isArray(row.warnings) ? row.warnings as string[] : [],
          referenced_asset_ids: assetIds,
          plan_id: '',
          created_at: row.created_at,
        };
        sendSuccess(res, data);
        return;
      }
    } catch { /* fall through */ }
  }

  sendError(res, 'NOT_FOUND', 'Artifact não encontrado', 404);
}

/**
 * GET /jobs/:jobId/artifacts/:artifactId/download — Download raw do artifact.
 *
 * Retorna o conteúdo bruto com Content-Type e Content-Disposition adequados.
 */
export function downloadArtifact(req: Request, res: Response): void {
  const { jobId, artifactId } = req.params;

  const job = orchestrator.getJobStatus(jobId);

  if (!job) {
    sendError(res, 'NOT_FOUND', 'Job não encontrado', 404);
    return;
  }

  if (!job.result?.exportResult) {
    sendError(res, 'NOT_READY', 'Job ainda não tem artifacts exportados', 409);
    return;
  }

  const artifact = job.result.exportResult.artifacts.find((a) => a.id === artifactId);

  if (!artifact) {
    sendError(res, 'NOT_FOUND', 'Artifact não encontrado', 404);
    return;
  }

  // Content-Type baseado no formato
  const contentTypeMap: Record<string, string> = {
    [ExportFormat.HTML]: 'text/html; charset=utf-8',
    [ExportFormat.MARKDOWN]: 'text/markdown; charset=utf-8',
    [ExportFormat.JSON]: 'application/json; charset=utf-8',
    [ExportFormat.RENDER_SPEC]: 'application/json; charset=utf-8',
  };

  // Extensão do arquivo
  const extensionMap: Record<string, string> = {
    [ExportFormat.HTML]: 'html',
    [ExportFormat.MARKDOWN]: 'md',
    [ExportFormat.JSON]: 'json',
    [ExportFormat.RENDER_SPEC]: 'json',
  };

  const contentType = contentTypeMap[artifact.exportFormat] ?? 'application/octet-stream';
  const extension = extensionMap[artifact.exportFormat] ?? 'bin';
  const filename = `${artifact.planId}-${artifact.artifactType}.${extension}`;

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', artifact.sizeBytes.toString());
  res.send(artifact.content);
}

// ---------------------------------------------------------------------------
// DB Helpers
// ---------------------------------------------------------------------------

async function fetchArtifactRows(jobId: string): Promise<ArtifactRow[]> {
  if (!jobRepository) return [];
  const rows = await jobRepository.getArtifacts(jobId);
  return rows as unknown as ArtifactRow[];
}

function artifactRowToListItem(row: ArtifactRow): ArtifactListItem {
  const assetIds = Array.isArray(row.referenced_asset_ids) ? row.referenced_asset_ids as string[] : [];
  return {
    id: row.id,
    artifact_type: row.artifact_type as ArtifactType,
    export_format: row.export_format as ExportFormat,
    output_format: row.output_format as OutputFormat,
    title: row.title,
    size_bytes: row.size_bytes,
    status: row.status as ArtifactStatus,
    warnings: Array.isArray(row.warnings) ? row.warnings as string[] : [],
    referenced_asset_count: assetIds.length,
    created_at: row.created_at,
  };
}
