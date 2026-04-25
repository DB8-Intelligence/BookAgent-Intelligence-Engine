/**
 * Book Job Repository — Persistência de jobs editoriais
 *
 * Gerencia o ciclo de vida de um job editorial na tabela `book_jobs`.
 * Segue o padrão de `src/persistence/job-repository.ts`:
 *  - row-type snake_case que reflete a migration
 *  - métodos async thin-wrapper sobre `SupabaseClient`
 *  - mapeamento explícito entidade camelCase ↔ row snake_case
 *
 * Todas as escritas são auditáveis via coluna `updated_at` (trigger) e via
 * linhas em `book_job_steps` e `book_approval_rounds`, nunca aqui.
 */

import type { SupabaseClient } from './supabase-client.js';
import type {
  BookJob,
  BookJobStatus,
  BookStepName,
  CreateBookJobInput,
} from '../domain/entities/book-editorial.js';
import { BOOK_EDITORIAL_SEQUENCE } from '../domain/entities/book-editorial.js';
import { logger } from '../utils/logger.js';

// ----------------------------------------------------------------------------
// Row type (matches supabase/migrations/010_book_editorial_pipeline.sql)
// ----------------------------------------------------------------------------

export interface BookJobRow {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  title: string;
  brief: string | null;
  status: string;
  current_step: string | null;
  progress: number;
  total_steps: number;
  completed_steps: number;
  metadata: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// ----------------------------------------------------------------------------
// Mappers
// ----------------------------------------------------------------------------

function rowToEntity(row: BookJobRow): BookJob {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    title: row.title,
    brief: row.brief,
    status: row.status as BookJobStatus,
    currentStep: (row.current_step as BookStepName | null) ?? null,
    progress: row.progress,
    totalSteps: row.total_steps,
    completedSteps: row.completed_steps,
    metadata: row.metadata ?? {},
    error: row.error,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    startedAt: row.started_at ? new Date(row.started_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
  };
}

// ----------------------------------------------------------------------------
// Repository
// ----------------------------------------------------------------------------

export class BookJobRepository {
  private readonly table = 'book_jobs';

  constructor(private readonly client: SupabaseClient) {}

  /**
   * Cria um job editorial no estado `draft`. O caller decide quando
   * transicionar para `queued` via `markQueued()`.
   */
  async createJob(input: CreateBookJobInput): Promise<BookJob> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const row: BookJobRow = {
      id,
      tenant_id: input.tenantId ?? null,
      user_id: input.userId ?? null,
      title: input.title,
      brief: input.brief ?? null,
      status: 'draft',
      current_step: null,
      progress: 0,
      total_steps: BOOK_EDITORIAL_SEQUENCE.length,
      completed_steps: 0,
      metadata: input.metadata ?? {},
      error: null,
      created_at: now,
      updated_at: now,
      started_at: null,
      completed_at: null,
    };

    const inserted = await this.client.insert<BookJobRow>(this.table, row);
    logger.info(`[BookJobRepository] Job ${id} created (title="${input.title}")`);
    return rowToEntity(inserted[0] ?? row);
  }

  /** Transição draft → queued (antes de enfileirar o primeiro step). */
  async markQueued(jobId: string): Promise<void> {
    await this.client.update(
      this.table,
      { column: 'id', operator: 'eq', value: jobId },
      {
        status: 'queued',
        updated_at: new Date().toISOString(),
      },
    );
  }

  /** Transição queued → running (chamada pelo processor no primeiro step). */
  async markRunning(jobId: string, currentStep: BookStepName): Promise<void> {
    const now = new Date().toISOString();
    await this.client.update(
      this.table,
      { column: 'id', operator: 'eq', value: jobId },
      {
        status: 'running',
        current_step: currentStep,
        started_at: now,
        updated_at: now,
      },
    );
  }

  /**
   * Atualiza o step corrente e o progresso. Chamado a cada transição.
   * O progresso é calculado pelo caller com base em `completed_steps / total_steps`.
   */
  async setCurrentStep(
    jobId: string,
    currentStep: BookStepName,
    completedSteps: number,
    totalSteps: number,
  ): Promise<void> {
    const progress = totalSteps > 0
      ? Math.min(100, Math.round((completedSteps / totalSteps) * 100))
      : 0;

    await this.client.update(
      this.table,
      { column: 'id', operator: 'eq', value: jobId },
      {
        current_step: currentStep,
        completed_steps: completedSteps,
        progress,
        updated_at: new Date().toISOString(),
      },
    );
  }

  /**
   * Retoma um job para o estado running sem tocar em started_at.
   * Usado após approve (não-terminal) ou reject — o job estava em
   * awaiting_approval e volta a executar no step alvo.
   */
  async resumeRunning(jobId: string, step: BookStepName): Promise<void> {
    await this.client.update(
      this.table,
      { column: 'id', operator: 'eq', value: jobId },
      {
        status: 'running',
        current_step: step,
        updated_at: new Date().toISOString(),
      },
    );
  }

  /** Transição para awaiting_approval após um step pedir gate humano. */
  async markAwaitingApproval(jobId: string, step: BookStepName): Promise<void> {
    await this.client.update(
      this.table,
      { column: 'id', operator: 'eq', value: jobId },
      {
        status: 'awaiting_approval',
        current_step: step,
        updated_at: new Date().toISOString(),
      },
    );
  }

  /** Marca o job como completed. */
  async completeJob(jobId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.client.update(
      this.table,
      { column: 'id', operator: 'eq', value: jobId },
      {
        status: 'completed',
        progress: 100,
        completed_at: now,
        updated_at: now,
      },
    );
    logger.info(`[BookJobRepository] Job ${jobId} completed`);
  }

  /** Marca o job como failed, registrando a mensagem de erro. */
  async failJob(jobId: string, error: string): Promise<void> {
    const now = new Date().toISOString();
    await this.client.update(
      this.table,
      { column: 'id', operator: 'eq', value: jobId },
      {
        status: 'failed',
        error,
        completed_at: now,
        updated_at: now,
      },
    );
    logger.warn(`[BookJobRepository] Job ${jobId} failed: ${error.slice(0, 120)}`);
  }

  /**
   * Faz merge do patch de metadata com o conteúdo atual. Input complementar
   * do usuário — não muda status, apenas enriquece contexto para steps futuros.
   */
  async updateMetadata(jobId: string, metadata: Record<string, unknown>): Promise<void> {
    await this.client.update(
      this.table,
      { column: 'id', operator: 'eq', value: jobId },
      {
        metadata,
        updated_at: new Date().toISOString(),
      },
    );
  }

  /** Busca um job pelo id. Retorna null se não existir. */
  async getJob(jobId: string): Promise<BookJob | null> {
    const rows = await this.client.select<BookJobRow>(this.table, {
      filters: [{ column: 'id', operator: 'eq', value: jobId }],
      limit: 1,
    });
    const row = rows[0];
    return row ? rowToEntity(row) : null;
  }

  /** Lista jobs ordenados por data de criação (mais recentes primeiro). */
  async listJobs(limit: number = 50): Promise<BookJob[]> {
    const rows = await this.client.select<BookJobRow>(this.table, {
      orderBy: 'created_at',
      orderDesc: true,
      limit,
    });
    return rows.map(rowToEntity);
  }
}
