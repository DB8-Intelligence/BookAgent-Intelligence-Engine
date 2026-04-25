/**
 * Book Approval Repository — Persistência de rodadas de aprovação humana
 *
 * Cada linha em `book_approval_rounds` é UMA rodada de aprovação para UM
 * step específico. Rejeição seguida de nova submissão = novo round com
 * `round` incrementado.
 */

import type { SupabaseClient } from './supabase-client.js';
import type {
  BookApprovalRound,
  BookApprovalKind,
  BookApprovalDecision,
  BookStepName,
  CreateBookApprovalRoundInput,
} from '../domain/entities/book-editorial.js';

// ----------------------------------------------------------------------------
// Row type
// ----------------------------------------------------------------------------

export interface BookApprovalRoundRow {
  id: string;
  job_id: string;
  step_name: string;
  round: number;
  kind: string;
  decision: string;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  comment: string | null;
  artifact_ref: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEntity(row: BookApprovalRoundRow): BookApprovalRound {
  return {
    id: row.id,
    jobId: row.job_id,
    stepName: row.step_name as BookStepName,
    round: row.round,
    kind: row.kind as BookApprovalKind,
    decision: row.decision as BookApprovalDecision,
    requestedAt: new Date(row.requested_at),
    decidedAt: row.decided_at ? new Date(row.decided_at) : null,
    decidedBy: row.decided_by,
    comment: row.comment,
    artifactRef: row.artifact_ref,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ----------------------------------------------------------------------------
// Repository
// ----------------------------------------------------------------------------

export class BookApprovalRepository {
  private readonly table = 'book_approval_rounds';

  constructor(private readonly client: SupabaseClient) {}

  /**
   * Cria uma nova rodada de aprovação pendente. Chamado quando um step
   * termina com outcome=`awaiting_approval`.
   */
  async createRound(input: CreateBookApprovalRoundInput): Promise<BookApprovalRound> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const row: BookApprovalRoundRow = {
      id,
      job_id: input.jobId,
      step_name: input.stepName,
      round: input.round,
      kind: input.kind,
      decision: 'pending',
      requested_at: now,
      decided_at: null,
      decided_by: null,
      comment: null,
      artifact_ref: input.artifactRef ?? null,
      created_at: now,
      updated_at: now,
    };

    const inserted = await this.client.insert<BookApprovalRoundRow>(this.table, row);
    return rowToEntity(inserted[0] ?? row);
  }

  /**
   * Registra a decisão de uma rodada pendente (approved, rejected,
   * changes_requested). Chamado pela API quando um revisor decide.
   */
  async recordDecision(
    roundId: string,
    decision: Exclude<BookApprovalDecision, 'pending'>,
    decidedBy: string,
    comment?: string | null,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.client.update(
      this.table,
      { column: 'id', operator: 'eq', value: roundId },
      {
        decision,
        decided_at: now,
        decided_by: decidedBy,
        comment: comment ?? null,
        updated_at: now,
      },
    );
  }

  /** Busca uma rodada pelo id. Retorna null se não existir. */
  async getRoundById(roundId: string): Promise<BookApprovalRound | null> {
    const rows = await this.client.select<BookApprovalRoundRow>(this.table, {
      filters: [{ column: 'id', operator: 'eq', value: roundId }],
      limit: 1,
    });
    const row = rows[0];
    return row ? rowToEntity(row) : null;
  }

  /** Busca a rodada mais recente (maior `round`) de um step de um job. */
  async getLatestRound(
    jobId: string,
    stepName: BookStepName,
  ): Promise<BookApprovalRound | null> {
    const rows = await this.client.select<BookApprovalRoundRow>(this.table, {
      filters: [
        { column: 'job_id', operator: 'eq', value: jobId },
        { column: 'step_name', operator: 'eq', value: stepName },
      ],
      orderBy: 'round',
      orderDesc: true,
      limit: 1,
    });
    const row = rows[0];
    return row ? rowToEntity(row) : null;
  }

  /** Lista todas as rodadas de um job. */
  async listRoundsForJob(jobId: string): Promise<BookApprovalRound[]> {
    const rows = await this.client.select<BookApprovalRoundRow>(this.table, {
      filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
      orderBy: 'created_at',
      orderDesc: false,
    });
    return rows.map(rowToEntity);
  }
}
