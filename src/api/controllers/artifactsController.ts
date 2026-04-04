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
import { Orchestrator } from '../../core/orchestrator.js';
import { sendSuccess, sendError } from '../helpers/response.js';
import type { ArtifactListItem, ArtifactDetailResponse } from '../types/responses.js';
import { ExportFormat } from '../../domain/entities/export-artifact.js';

let orchestrator: Orchestrator;

export function setOrchestrator(orch: Orchestrator): void {
  orchestrator = orch;
}

/**
 * GET /jobs/:jobId/artifacts — Lista artifacts do job.
 * Query params:
 *   ?type=media-render-spec  — Filtra por artifact type
 *   ?format=html             — Filtra por export format
 */
export function listArtifacts(req: Request, res: Response): void {
  const { jobId } = req.params;
  const typeFilter = req.query.type as string | undefined;
  const formatFilter = req.query.format as string | undefined;

  const job = orchestrator.getJobStatus(jobId);

  if (!job) {
    sendError(res, 'NOT_FOUND', 'Job não encontrado', 404);
    return;
  }

  if (!job.result?.exportResult) {
    sendError(res, 'NOT_READY', 'Job ainda não tem artifacts exportados', 409);
    return;
  }

  let artifacts = job.result.exportResult.artifacts;

  // Filtros opcionais
  if (typeFilter) {
    artifacts = artifacts.filter((a) => a.artifactType === typeFilter);
  }
  if (formatFilter) {
    artifacts = artifacts.filter((a) => a.exportFormat === formatFilter);
  }

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
}

/**
 * GET /jobs/:jobId/artifacts/:artifactId — Detalhe de um artifact com conteúdo.
 */
export function getArtifactDetail(req: Request, res: Response): void {
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
