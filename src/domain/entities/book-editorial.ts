/**
 * Book Editorial — Domain Entities
 *
 * Bounded context "book-editorial": pipeline multi-step de produção editorial
 * de livros (intake → market_analysis → theme_validation → book_dna → outline
 * → chapter_writing → editorial_qa).
 *
 * Este módulo define APENAS tipos de domínio. Nenhuma lógica de persistência
 * ou de execução vive aqui. Os row-types correspondentes (snake_case) ficam
 * nos repositórios em `src/persistence/book-*-repository.ts`.
 *
 * Princípios:
 * - Estado é normalizado; `metadata`/`content` JSONB são payloads complementares.
 * - Cada transição relevante gera uma nova linha (step attempt, approval round).
 * - Reexecução parcial é suportada via `attempt` no step.
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Status do job editorial. Normalizado em coluna, indexável.
 */
export type BookJobStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Status da tentativa de execução de um step.
 */
export type BookStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

/**
 * Nomes canônicos dos steps editoriais. Fonte única da verdade para:
 * - migration CHECK constraint
 * - registry de handlers
 * - validação de payload da fila
 */
export type BookStepName =
  | 'intake'
  | 'market_analysis'
  | 'theme_validation'
  | 'book_dna'
  | 'outline'
  | 'chapter_writing'
  | 'editorial_qa';

/**
 * Tipos de artefato gerados pelos steps. Também usado como CHECK constraint.
 */
export type BookArtifactKind =
  | 'intake_brief'
  | 'market_report'
  | 'theme_decision'
  | 'book_dna'
  | 'outline'
  | 'chapter_draft'
  | 'qa_report'
  | 'manuscript';

/**
 * Tipo de gate de aprovação.
 */
export type BookApprovalKind = 'intermediate' | 'final';

/**
 * Decisão de uma rodada de aprovação.
 */
export type BookApprovalDecision =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'changes_requested';

// ============================================================================
// Sequência canônica do pipeline editorial
// ============================================================================

/**
 * Ordem determinística dos steps. Usada pelo registry para descobrir o
 * próximo step e pelo repositório para atribuir `step_index`.
 *
 * Alterar esta lista é uma decisão arquitetural: deve ser revisada em
 * conjunto com a migration (CHECK constraint) e com o registry.
 */
export const BOOK_EDITORIAL_SEQUENCE: readonly BookStepName[] = [
  'intake',
  'market_analysis',
  'theme_validation',
  'book_dna',
  'outline',
  'chapter_writing',
  'editorial_qa',
] as const;

/**
 * Retorna o próximo step na sequência, ou `null` se for o último.
 * Função pura — não toca banco nem fila.
 */
export function nextBookStep(current: BookStepName): BookStepName | null {
  const idx = BOOK_EDITORIAL_SEQUENCE.indexOf(current);
  if (idx < 0 || idx >= BOOK_EDITORIAL_SEQUENCE.length - 1) return null;
  return BOOK_EDITORIAL_SEQUENCE[idx + 1] ?? null;
}

/**
 * Retorna o índice (0-based) do step na sequência canônica.
 * Usado para popular `book_job_steps.step_index`.
 */
export function bookStepIndex(step: BookStepName): number {
  return BOOK_EDITORIAL_SEQUENCE.indexOf(step);
}

// ============================================================================
// Entidades (forma camelCase; a forma snake_case de row vive nos repos)
// ============================================================================

/**
 * Job editorial persistido. Reflete o row de `book_jobs` já desserializado.
 */
export interface BookJob {
  id: string;
  tenantId: string | null;
  userId: string | null;
  title: string;
  brief: string | null;
  status: BookJobStatus;
  currentStep: BookStepName | null;
  progress: number;
  totalSteps: number;
  completedSteps: number;
  metadata: Record<string, unknown>;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

/**
 * Tentativa de execução de um step. Cada `(job_id, step_name, attempt)` é único.
 */
export interface BookJobStep {
  id: string;
  jobId: string;
  stepName: BookStepName;
  stepIndex: number;
  attempt: number;
  status: BookStepStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  error: string | null;
  /** Ponteiros para artefatos de entrada (ids de `book_artifacts`). Não é payload. */
  inputRef: Record<string, unknown>;
  metrics: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Artefato gerado por um step. O `content` JSONB carrega o payload estruturado
 * (brief, report, outline etc.), NUNCA estado de controle do pipeline.
 */
export interface BookArtifact {
  id: string;
  jobId: string;
  stepId: string | null;
  stepName: BookStepName;
  kind: BookArtifactKind;
  version: number;
  title: string | null;
  content: Record<string, unknown>;
  contentUrl: string | null;
  createdAt: Date;
}

/**
 * Rodada de aprovação humana associada a um step.
 */
export interface BookApprovalRound {
  id: string;
  jobId: string;
  stepName: BookStepName;
  round: number;
  kind: BookApprovalKind;
  decision: BookApprovalDecision;
  requestedAt: Date;
  decidedAt: Date | null;
  decidedBy: string | null;
  comment: string | null;
  artifactRef: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Inputs para criação (sem campos gerenciados pelo banco)
// ============================================================================

export interface CreateBookJobInput {
  tenantId?: string | null;
  userId?: string | null;
  title: string;
  brief?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateBookJobStepInput {
  jobId: string;
  stepName: BookStepName;
  stepIndex: number;
  attempt: number;
  inputRef?: Record<string, unknown>;
}

export interface CreateBookArtifactInput {
  jobId: string;
  stepId: string | null;
  stepName: BookStepName;
  kind: BookArtifactKind;
  version?: number;
  title?: string | null;
  content: Record<string, unknown>;
  contentUrl?: string | null;
}

export interface CreateBookApprovalRoundInput {
  jobId: string;
  stepName: BookStepName;
  round: number;
  kind: BookApprovalKind;
  artifactRef?: string | null;
}
