/**
 * Task Handlers — execução idempotente compartilhada por /tasks/* e /internal/*.
 *
 * Cada handler:
 *   1. Faz claimTask() no Firestore — se já 'completed', retorna sem reexecutar.
 *   2. Executa o trabalho real (delegando aos modules existentes).
 *   3. Marca completed/failed no store.
 *   4. Loga estruturado: [task scope] taskId=X type=Y jobId=Z attempt=N status=W.
 *
 * Os routers (`tasks.ts` e `internal.ts`) só chamam estas funções — toda a
 * lógica de idempotência fica concentrada aqui pra evitar drift entre o
 * endpoint novo e o alias deprecated.
 */

import { logger } from '../utils/logger.js';
import {
  claimTask,
  markCompleted,
  markFailed,
  type ClaimResult,
} from '../persistence/task-execution-store.js';
import {
  buildTaskId,
  type PipelineTaskPayload,
  type VideoRenderTaskPayload,
  type EditorialTaskPayload,
  type PublicationTaskPayload,
  type CleanupTaskPayload,
  type TaskType,
} from './cloud-tasks.js';
import { executePipelineForTask } from './job-processor.js';
import { processVideoRenderJob } from './video-processor.js';
import type { Orchestrator } from '../core/orchestrator.js';
import type { PersistentOrchestrator } from '../persistence/persistent-orchestrator.js';
import type { JobRepository } from '../persistence/job-repository.js';
import type { ArtifactRepository } from '../persistence/artifact-repository.js';
import type { StorageManager } from '../persistence/storage-manager.js';
import type { SupabaseClient } from '../persistence/supabase-client.js';
import { createBookEditorialRegistry } from '../modules/book-editorial/index.js';
import type { BookStepName } from '../domain/entities/book-editorial.js';

// ---------------------------------------------------------------------------
// Shared deps
// ---------------------------------------------------------------------------

export interface TaskHandlerDeps {
  orchestrator: Orchestrator | PersistentOrchestrator;
  jobRepo: JobRepository | null;
  artifactRepo: ArtifactRepository | null;
  storageManager: StorageManager | null;
  supabaseClient: SupabaseClient | null;
}

// ---------------------------------------------------------------------------
// Logging — formato consistente pra grep/Cloud Logging filters
// ---------------------------------------------------------------------------

function logTask(
  level: 'info' | 'warn' | 'error',
  type: TaskType,
  taskId: string,
  msg: string,
  extra: Record<string, unknown> = {},
): void {
  const fields = Object.entries(extra)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ');
  const line = `[task] type=${type} taskId=${taskId} ${fields} — ${msg}`;
  logger[level](line);
}

// ---------------------------------------------------------------------------
// Idempotency wrapper — todos os handlers passam por aqui
// ---------------------------------------------------------------------------

async function withIdempotency<T extends object>(
  type: TaskType,
  jobId: string,
  stepId: string | undefined,
  payload: T,
  run: (claim: ClaimResult, taskId: string) => Promise<void>,
): Promise<{ taskId: string; status: 'executed' | 'skipped-completed' }> {
  const taskId = buildTaskId(type, jobId, stepId);

  let claim: ClaimResult;
  try {
    claim = await claimTask({
      type,
      jobId,
      stepId,
      payload: payload as unknown as Record<string, unknown>,
    });
  } catch (err) {
    // Firestore offline ou indisponível — fail open: roda sem idempotency.
    // Cloud Tasks ainda deduplica via taskName, então o blast radius é baixo.
    logTask('warn', type, taskId, 'claim failed — running without idempotency', {
      err: (err as Error).message,
    });
    await run(
      { status: 'new', attempt: 1, record: {} as never },
      taskId,
    );
    return { taskId, status: 'executed' };
  }

  if (claim.status === 'already-completed') {
    logTask('info', type, taskId, 'already completed — skipping', {
      jobId,
      attempt: claim.record.attempt,
    });
    return { taskId, status: 'skipped-completed' };
  }

  logTask('info', type, taskId, 'starting', { jobId, attempt: claim.attempt });

  try {
    await run(claim, taskId);
    await markCompleted(taskId);
    logTask('info', type, taskId, 'completed', { jobId, attempt: claim.attempt });
    return { taskId, status: 'executed' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markFailed(taskId, msg);
    logTask('error', type, taskId, 'failed', { jobId, attempt: claim.attempt, err: msg });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handlePipelineTask(
  payload: PipelineTaskPayload,
  deps: TaskHandlerDeps,
): Promise<{ taskId: string; status: 'executed' | 'skipped-completed' }> {
  return withIdempotency('pipeline', payload.jobId, undefined, payload, async () => {
    await executePipelineForTask(payload, deps);
  });
}

export async function handleVideoTask(
  payload: VideoRenderTaskPayload,
  deps: TaskHandlerDeps,
): Promise<{ taskId: string; status: 'executed' | 'skipped-completed' }> {
  return withIdempotency('video', payload.jobId, payload.artifactId, payload, async () => {
    const fakeJob = {
      data: payload,
      attemptsMade: 0,
      opts: { attempts: 1 },
    } as unknown as Parameters<typeof processVideoRenderJob>[0];

    await processVideoRenderJob(fakeJob, {
      supabase: deps.supabaseClient,
      outputDir: 'storage/outputs/video',
      tempDir: 'storage/temp/video',
    });
  });
}

/**
 * Editorial step dispatch — Phase 1.
 *
 * Resolve o handler pelo nome via registry. Como o context loader (DB →
 * BookEditorialContext) ainda não está wired, este handler valida o stepName
 * e marca a task como completed. A execução real do handler virá quando o
 * book-editorial-processor for implementado em sprint posterior.
 */
const editorialRegistry = createBookEditorialRegistry();

export async function handleEditorialTask(
  payload: EditorialTaskPayload,
  _deps: TaskHandlerDeps,
): Promise<{ taskId: string; status: 'executed' | 'skipped-completed' }> {
  return withIdempotency('editorial', payload.jobId, payload.stepName, payload, async (_, taskId) => {
    const handler = editorialRegistry.resolve(payload.stepName as BookStepName);
    if (!handler) {
      throw new Error(
        `[editorial] unknown step "${payload.stepName}" — known: ${editorialRegistry.list().join(', ')}`,
      );
    }
    logTask('info', 'editorial', taskId, 'handler resolved (processor not wired in this sprint)', {
      jobId: payload.jobId,
      step: payload.stepName,
      handler: handler.name,
    });
    // TODO(book-editorial): construir BookEditorialContext via repos e chamar handler.run(ctx).
    // Por enquanto a task termina como completed (no-op funcional) — o pipeline
    // editorial real depende do processor que será wired em sprint dedicado.
  });
}

/**
 * Publication task — chama o webhook n8n com o payload de aprovação/publicação.
 * Substitui chamadas inline a triggerN8nApproval no approvalController.
 */
export async function handlePublicationTask(
  payload: PublicationTaskPayload,
  _deps: TaskHandlerDeps,
): Promise<{ taskId: string; status: 'executed' | 'skipped-completed' }> {
  const stepId = `${payload.approvalRound}-${payload.decision}`;
  return withIdempotency('publication', payload.jobId, stepId, payload, async (_, taskId) => {
    const base = process.env.N8N_WEBHOOK_BASE_URL ?? 'https://automacao.db8intelligence.com.br';
    const url = `${base}/webhook/bookagent/aprovacao`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(
        `[publication] n8n returned ${res.status} for taskId=${taskId} job=${payload.jobId}`,
      );
    }
    logTask('info', 'publication', taskId, 'n8n webhook delivered', {
      jobId: payload.jobId,
      decision: payload.decision,
      status: res.status,
    });
  });
}

/**
 * Cleanup task — framework only.
 *
 * Aceita o payload, registra estruturado e responde 200 sem trabalho real.
 * Lógica de cleanup (limpeza de storage temp, expiração de drafts, etc.)
 * será implementada conforme demanda — por ora, este endpoint só prova que
 * o pipeline de enfileiramento está funcionando.
 */
export async function handleCleanupTask(
  payload: CleanupTaskPayload,
  _deps: TaskHandlerDeps,
): Promise<{ taskId: string; status: 'executed' | 'skipped-completed' }> {
  return withIdempotency('cleanup', payload.scope, payload.reference, payload, async (_, taskId) => {
    logTask('info', 'cleanup', taskId, 'cleanup framework invoked (no-op)', {
      scope: payload.scope,
      reference: payload.reference ?? null,
    });
  });
}
