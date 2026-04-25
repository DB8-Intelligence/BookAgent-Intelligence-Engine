/**
 * Book Editorial Artifact Repository — Persistência de artefatos editoriais
 *
 * Cada linha em `book_artifacts` é um output estruturado de UM step. O
 * `content JSONB` guarda o payload (brief, report, outline, etc.) — NUNCA
 * estado de controle do pipeline.
 *
 * Reescritas de um mesmo artefato geram nova linha com `version++`, mantendo
 * a anterior para auditoria.
 */

import type { SupabaseClient } from './supabase-client.js';
import type {
  BookArtifact,
  BookArtifactKind,
  BookStepName,
  CreateBookArtifactInput,
} from '../domain/entities/book-editorial.js';

// ----------------------------------------------------------------------------
// Row type
// ----------------------------------------------------------------------------

export interface BookArtifactRow {
  id: string;
  job_id: string;
  step_id: string | null;
  step_name: string;
  kind: string;
  version: number;
  title: string | null;
  content: Record<string, unknown> | null;
  content_url: string | null;
  created_at: string;
}

function rowToEntity(row: BookArtifactRow): BookArtifact {
  return {
    id: row.id,
    jobId: row.job_id,
    stepId: row.step_id,
    stepName: row.step_name as BookStepName,
    kind: row.kind as BookArtifactKind,
    version: row.version,
    title: row.title,
    content: row.content ?? {},
    contentUrl: row.content_url,
    createdAt: new Date(row.created_at),
  };
}

// ----------------------------------------------------------------------------
// Repository
// ----------------------------------------------------------------------------

export class BookEditorialArtifactRepository {
  private readonly table = 'book_artifacts';

  constructor(private readonly client: SupabaseClient) {}

  /**
   * Salva um artefato gerado por um step. Retorna a entidade com id.
   */
  async saveArtifact(input: CreateBookArtifactInput): Promise<BookArtifact> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const row: BookArtifactRow = {
      id,
      job_id: input.jobId,
      step_id: input.stepId,
      step_name: input.stepName,
      kind: input.kind,
      version: input.version ?? 1,
      title: input.title ?? null,
      content: input.content,
      content_url: input.contentUrl ?? null,
      created_at: now,
    };

    const inserted = await this.client.insert<BookArtifactRow>(this.table, row);
    return rowToEntity(inserted[0] ?? row);
  }

  /** Lista artefatos de um job, em ordem de criação. */
  async listArtifactsForJob(jobId: string): Promise<BookArtifact[]> {
    const rows = await this.client.select<BookArtifactRow>(this.table, {
      filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
      orderBy: 'created_at',
      orderDesc: false,
    });
    return rows.map(rowToEntity);
  }

  /** Lista artefatos de um step específico. */
  async listArtifactsForStep(stepId: string): Promise<BookArtifact[]> {
    const rows = await this.client.select<BookArtifactRow>(this.table, {
      filters: [{ column: 'step_id', operator: 'eq', value: stepId }],
      orderBy: 'created_at',
      orderDesc: false,
    });
    return rows.map(rowToEntity);
  }

  /** Retorna o artefato mais recente de um tipo específico em um job. */
  async getLatestByKind(
    jobId: string,
    kind: BookArtifactKind,
  ): Promise<BookArtifact | null> {
    const rows = await this.client.select<BookArtifactRow>(this.table, {
      filters: [
        { column: 'job_id', operator: 'eq', value: jobId },
        { column: 'kind', operator: 'eq', value: kind },
      ],
      orderBy: 'version',
      orderDesc: true,
      limit: 1,
    });
    const row = rows[0];
    return row ? rowToEntity(row) : null;
  }
}
