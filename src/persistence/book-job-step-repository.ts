/**
 * Book Job Step Repository — Persistência de tentativas de execução de steps
 *
 * Cada linha em `book_job_steps` representa UMA tentativa de executar UM step
 * de UM job. Reexecução = nova linha com `attempt` incrementado. Isso dá
 * rastreabilidade total sem UPDATE destrutivo.
 *
 * O processor usa este repositório para:
 *  - `createStep` antes de executar o handler (status=pending)
 *  - `markRunning` ao iniciar a execução
 *  - `markCompleted` / `markFailed` ao terminar
 *  - `getLatestAttempt` para resumir estado do pipeline
 */

import type { SupabaseClient } from './supabase-client.js';
import type {
  BookJobStep,
  BookStepName,
  BookStepStatus,
  CreateBookJobStepInput,
} from '../domain/entities/book-editorial.js';
import { logger } from '../utils/logger.js';

// ----------------------------------------------------------------------------
// Row type
// ----------------------------------------------------------------------------

export interface BookJobStepRow {
  id: string;
  job_id: string;
  step_name: string;
  step_index: number;
  attempt: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error: string | null;
  input_ref: Record<string, unknown> | null;
  metrics: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function rowToEntity(row: BookJobStepRow): BookJobStep {
  return {
    id: row.id,
    jobId: row.job_id,
    stepName: row.step_name as BookStepName,
    stepIndex: row.step_index,
    attempt: row.attempt,
    status: row.status as BookStepStatus,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    durationMs: row.duration_ms,
    error: row.error,
    inputRef: row.input_ref ?? {},
    metrics: row.metrics ?? {},
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ----------------------------------------------------------------------------
// Repository
// ----------------------------------------------------------------------------

export class BookJobStepRepository {
  private readonly table = 'book_job_steps';

  constructor(private readonly client: SupabaseClient) {}

  /**
   * Cria uma nova tentativa de step no estado `pending`. Retorna a entidade
   * criada já com id gerado.
   */
  async createStep(input: CreateBookJobStepInput): Promise<BookJobStep> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const row: BookJobStepRow = {
      id,
      job_id: input.jobId,
      step_name: input.stepName,
      step_index: input.stepIndex,
      attempt: input.attempt,
      status: 'pending',
      started_at: null,
      completed_at: null,
      duration_ms: null,
      error: null,
      input_ref: input.inputRef ?? {},
      metrics: {},
      created_at: now,
      updated_at: now,
    };

    const inserted = await this.client.insert<BookJobStepRow>(this.table, row);
    return rowToEntity(inserted[0] ?? row);
  }

  /** Transição pending → running. */
  async markRunning(stepId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.client.update(
      this.table,
      { column: 'id', operator: 'eq', value: stepId },
      {
        status: 'running',
        started_at: now,
        updated_at: now,
      },
    );
  }

  /** Transição running → completed, registrando métricas opcionais. */
  async markCompleted(
    stepId: string,
    durationMs: number,
    metrics: Record<string, unknown> = {},
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.client.update(
      this.table,
      { column: 'id', operator: 'eq', value: stepId },
      {
        status: 'completed',
        completed_at: now,
        duration_ms: durationMs,
        metrics,
        updated_at: now,
      },
    );
  }

  /** Transição running → failed, registrando erro. */
  async markFailed(
    stepId: string,
    error: string,
    durationMs: number,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.client.update(
      this.table,
      { column: 'id', operator: 'eq', value: stepId },
      {
        status: 'failed',
        completed_at: now,
        duration_ms: durationMs,
        error,
        updated_at: now,
      },
    );
    logger.warn(`[BookJobStepRepository] Step ${stepId} failed: ${error.slice(0, 120)}`);
  }

  /** Marca um step como skipped (ex: replay seletivo). */
  async markSkipped(stepId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.client.update(
      this.table,
      { column: 'id', operator: 'eq', value: stepId },
      {
        status: 'skipped',
        completed_at: now,
        updated_at: now,
      },
    );
  }

  /** Retorna um step pelo id. */
  async getStep(stepId: string): Promise<BookJobStep | null> {
    const rows = await this.client.select<BookJobStepRow>(this.table, {
      filters: [{ column: 'id', operator: 'eq', value: stepId }],
      limit: 1,
    });
    const row = rows[0];
    return row ? rowToEntity(row) : null;
  }

  /**
   * Retorna a última tentativa de um step específico (maior `attempt`).
   * Útil para retomar ou reexecutar.
   */
  async getLatestAttempt(
    jobId: string,
    stepName: BookStepName,
  ): Promise<BookJobStep | null> {
    const rows = await this.client.select<BookJobStepRow>(this.table, {
      filters: [
        { column: 'job_id', operator: 'eq', value: jobId },
        { column: 'step_name', operator: 'eq', value: stepName },
      ],
      orderBy: 'attempt',
      orderDesc: true,
      limit: 1,
    });
    const row = rows[0];
    return row ? rowToEntity(row) : null;
  }

  /** Lista todas as tentativas de um job, em ordem cronológica. */
  async listStepsForJob(jobId: string): Promise<BookJobStep[]> {
    const rows = await this.client.select<BookJobStepRow>(this.table, {
      filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
      orderBy: 'created_at',
      orderDesc: false,
    });
    return rows.map(rowToEntity);
  }
}
