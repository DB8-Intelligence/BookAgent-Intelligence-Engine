/**
 * Artifact Repository — Persistência de Artifacts no Supabase
 *
 * Registra os artifacts gerados pelo pipeline no banco.
 * Tabelas: bookagent_job_artifacts, bookagent_job_events
 *
 * Operações:
 * - saveArtifacts: Persiste lista de artifacts de um job
 * - saveEvents: Persiste eventos de execução do pipeline
 * - getArtifacts: Lista artifacts de um job
 *
 * Uso:
 *   const repo = new ArtifactRepository(client);
 *   await repo.saveArtifacts(job.id, result.exportResult.artifacts);
 */

import type { ExportArtifact } from '../domain/entities/export-artifact.js';
import type { ModuleExecutionLog } from '../domain/entities/module-log.js';
import type { SupabaseClient } from './supabase-client.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// DB Row types
// ---------------------------------------------------------------------------

interface ArtifactRow {
  id: string;
  job_id: string;
  artifact_type: string;
  export_format: string;
  output_format: string | null;
  title: string;
  file_path: string | null;
  size_bytes: number;
  status: string;
  warnings: string[];
  referenced_asset_ids: string[];
  created_at: string;
}

interface EventRow {
  job_id: string;
  stage: string;
  module_name: string;
  status: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  error: string | null;
  metrics: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class ArtifactRepository {
  private artifactsTable = 'bookagent_job_artifacts';
  private eventsTable = 'bookagent_job_events';

  constructor(private client: SupabaseClient) {}

  /**
   * Persiste artifacts de um job no banco.
   * Artifacts com content grande são referenciados por filePath (não salva o content).
   * Insere em lotes para eficiência.
   */
  async saveArtifacts(jobId: string, artifacts: ExportArtifact[]): Promise<void> {
    if (artifacts.length === 0) return;

    const rows: ArtifactRow[] = artifacts.map((a) => ({
      id: a.id,
      job_id: jobId,
      artifact_type: a.artifactType,
      export_format: a.exportFormat,
      output_format: a.outputFormat ?? null,
      title: a.title,
      file_path: a.filePath ?? null,
      size_bytes: a.sizeBytes,
      status: a.status,
      warnings: a.warnings,
      referenced_asset_ids: a.referencedAssetIds,
      created_at: a.createdAt.toISOString(),
    }));

    // Inserir em lotes de 50 para evitar payload muito grande
    const BATCH_SIZE = 50;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await this.client.insert(this.artifactsTable, batch);
    }

    logger.info(
      `[ArtifactRepository] ${artifacts.length} artifacts persisted for job ${jobId}`,
    );
  }

  /**
   * Persiste eventos de execução do pipeline (módulo por módulo).
   * Derivado de context.executionLogs após pipeline completar.
   */
  async saveEvents(jobId: string, logs: ModuleExecutionLog[]): Promise<void> {
    if (logs.length === 0) return;

    const rows: EventRow[] = logs.map((log) => ({
      job_id: jobId,
      stage: log.stage,
      module_name: log.moduleName,
      status: log.status,
      started_at: log.startedAt.toISOString(),
      completed_at: log.completedAt.toISOString(),
      duration_ms: log.durationMs,
      error: log.error ?? null,
      metrics: {
        itemsProcessed: log.metrics.itemsProcessed,
        itemsCreated: log.metrics.itemsCreated,
        itemsSkipped: log.metrics.itemsSkipped,
        ...log.metrics.extra,
      },
    }));

    await this.client.insert(this.eventsTable, rows);

    logger.info(
      `[ArtifactRepository] ${logs.length} pipeline events persisted for job ${jobId}`,
    );
  }

  /**
   * Lista artifacts de um job, ordenados por data de criação.
   */
  async getArtifacts(jobId: string): Promise<ArtifactRow[]> {
    return this.client.select<ArtifactRow>(this.artifactsTable, {
      filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
      orderBy: 'created_at',
      orderDesc: false,
    });
  }

  /**
   * Lista eventos de execução de um job, em ordem cronológica.
   */
  async getEvents(jobId: string): Promise<EventRow[]> {
    return this.client.select<EventRow>(this.eventsTable, {
      filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
      orderBy: 'started_at',
      orderDesc: false,
    });
  }
}
