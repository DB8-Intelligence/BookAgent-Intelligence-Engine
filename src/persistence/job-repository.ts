/**
 * Job Repository — Persistência de Jobs no Supabase
 *
 * Gerencia a persistência do ciclo de vida dos jobs no Supabase/Postgres.
 * Tabela: bookagent_jobs
 *
 * Operações:
 * - createJob: Registra novo job (status=pending)
 * - updateStatus: Atualiza status durante execução
 * - completeJob: Salva resultado final + contagens
 * - failJob: Salva erro
 * - getJob: Busca por ID
 * - listJobs: Lista com paginação
 *
 * Uso:
 *   const repo = new JobRepository(client);
 *   await repo.createJob(job);
 *   await repo.completeJob(job.id, result);
 */

import type { Job, JobResult } from '../domain/entities/job.js';
import type { SupabaseClient } from './supabase-client.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// DB Row type (matches bookagent_jobs schema)
// ---------------------------------------------------------------------------

export interface JobRow {
  id: string;
  status: string;
  input_file_url: string;
  input_type: string;
  user_context: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  error: string | null;
  delivery_status: string | null;
  sources_count: number;
  narratives_count: number;
  artifacts_count: number;
  pipeline_duration_ms: number | null;
  cost_brl: number | null;
  tenant_id: string | null;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class JobRepository {
  private table = 'bookagent_jobs';

  constructor(private client: SupabaseClient) {}

  /**
   * Registra um job recém-criado no banco (status=pending).
   * Chamado no início do processo, antes da execução do pipeline.
   */
  async createJob(job: Job): Promise<void> {
    const row: JobRow = {
      id: job.id,
      status: job.status,
      input_file_url: job.input.fileUrl,
      input_type: job.input.type,
      user_context: job.input.userContext as Record<string, unknown>,
      created_at: job.createdAt.toISOString(),
      updated_at: job.updatedAt.toISOString(),
      completed_at: null,
      error: null,
      delivery_status: null,
      sources_count: 0,
      narratives_count: 0,
      artifacts_count: 0,
      pipeline_duration_ms: null,
      cost_brl: 0,
      tenant_id: (job.input.userContext as any)?.tenantId ?? null,
    };

    await this.client.insert(this.table, row);
    logger.info(`[JobRepository] Job ${job.id} created (status=${job.status})`);

    // Also create job_meta row for dashboard visibility
    const uc = job.input.userContext as Record<string, unknown> | undefined;
    const tenantId = uc?.tenantId as string | undefined;
    const userId = uc?.authUserId as string | undefined;
    if (tenantId) {
      try {
        await this.client.insert('bookagent_job_meta', {
          job_id: job.id,
          user_id: userId ?? 'unknown',
          plan_type: (uc?.planTier as string) ?? 'starter',
          source_channel: 'dashboard',
          approval_status: 'pending',
          approval_round: 0,
          tenant_id: tenantId,
        });
        logger.info(`[JobRepository] Job meta created for ${job.id} (tenant=${tenantId})`);
      } catch (metaErr) {
        logger.warn(`[JobRepository] Failed to create job_meta for ${job.id}: ${metaErr}`);
      }
    }
  }

  /**
   * Persiste o mapeamento assetId → URL pública para uso no video render.
   */
  async updateAssetUrlMap(jobId: string, assetUrlMap: Record<string, string>): Promise<void> {
    await this.client.update(
      this.table,
      { column: 'id', operator: 'eq', value: jobId },
      { asset_url_map: JSON.stringify(assetUrlMap) },
    );
    logger.info(`[JobRepository] Asset URL map saved for job ${jobId} (${Object.keys(assetUrlMap).length} entries)`);
  }

  /**
   * Atualiza status durante execução (pending → processing).
   */
  async updateStatus(jobId: string, status: string): Promise<void> {
    await this.client.update(
      this.table,
      { column: 'id', operator: 'eq', value: jobId },
      {
        status,
        updated_at: new Date().toISOString(),
      },
    );
  }

  /**
   * Persiste resultado final de um job completado com sucesso.
   * Extrai contagens e metadata do JobResult.
   */
  async completeJob(
    jobId: string,
    result: JobResult,
    durationMs?: number,
    costBRL?: number,
  ): Promise<void> {
    const artifactsCount = result.exportResult?.totalArtifacts ?? 0;
    const sourcesCount = result.sources?.length ?? 0;
    const narrativesCount = result.narratives?.length ?? 0;
    const deliveryStatus = result.deliveryResult?.status ?? null;

    await this.client.update(
      this.table,
      { column: 'id', operator: 'eq', value: jobId },
      {
        status: 'completed',
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        delivery_status: deliveryStatus,
        sources_count: sourcesCount,
        narratives_count: narrativesCount,
        artifacts_count: artifactsCount,
        pipeline_duration_ms: durationMs ?? null,
        cost_brl: costBRL ?? 0,
      },
    );

    logger.info(
      `[JobRepository] Job ${jobId} completed: ` +
      `${sourcesCount} sources, ${narrativesCount} narratives, ${artifactsCount} artifacts`,
    );
  }

  /**
   * Registra falha de um job.
   */
  async failJob(jobId: string, error: string): Promise<void> {
    await this.client.update(
      this.table,
      { column: 'id', operator: 'eq', value: jobId },
      {
        status: 'failed',
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        error,
      },
    );

    logger.info(`[JobRepository] Job ${jobId} failed: ${error.slice(0, 100)}`);
  }

  /**
   * Busca um job pelo ID.
   * Retorna null se não encontrado.
   */
  async getJob(jobId: string): Promise<JobRow | null> {
    const rows = await this.client.select<JobRow>(this.table, {
      filters: [{ column: 'id', operator: 'eq', value: jobId }],
      limit: 1,
    });

    return rows[0] ?? null;
  }

  /**
   * Lista jobs com paginação, ordenados por data de criação (mais recentes primeiro).
   */
  async listJobs(limit: number = 50): Promise<JobRow[]> {
    return this.client.select<JobRow>(this.table, {
      orderBy: 'created_at',
      orderDesc: true,
      limit,
    });
  }

  /**
   * Lista artefatos de um job.
   */
  async getArtifacts(jobId: string): Promise<Record<string, unknown>[]> {
    return this.client.select<Record<string, unknown>>(
      'bookagent_job_artifacts',
      {
        filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
      },
    );
  }

  /**
   * Conta artefatos por tipo para um job.
   * Usado para computar output_summary quando o job vem do banco.
   */
  async countArtifactsByType(jobId: string): Promise<ArtifactCounts> {
    const rows = await this.client.select<{ artifact_type: string; output_format: string }>(
      'bookagent_job_artifacts',
      {
        filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
        select: 'artifact_type,output_format',
      },
    );

    const counts: ArtifactCounts = { media_plans: 0, blog_plans: 0, landing_page_plans: 0, selected_outputs: 0 };

    const seen = new Set<string>();
    for (const row of rows) {
      // Count unique output_format entries per type (avoid double-counting render-spec + metadata)
      const key = `${row.artifact_type}:${row.output_format}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (row.artifact_type === 'media-render-spec') counts.media_plans++;
      else if (row.artifact_type === 'blog-article') counts.blog_plans++;
      else if (row.artifact_type === 'landing-page') counts.landing_page_plans++;
    }

    counts.selected_outputs = counts.media_plans + counts.blog_plans + counts.landing_page_plans;
    return counts;
  }
}

export interface ArtifactCounts {
  media_plans: number;
  blog_plans: number;
  landing_page_plans: number;
  selected_outputs: number;
}
