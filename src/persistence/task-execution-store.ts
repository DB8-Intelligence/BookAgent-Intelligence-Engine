/**
 * Task Execution Store — idempotência via Firestore `tasks/{taskId}`
 *
 * Cada task (pipeline, video, editorial, publication, cleanup) é representada
 * por um documento em Firestore com taskId determinístico. Os handlers em
 * `src/queue/task-handlers.ts` consultam este store antes de executar:
 *
 *   1. claimTask(taskId, ...)   → 'new' | 'already-completed'
 *      - 'new': handler executa, depois chama markCompleted/markFailed
 *      - 'already-completed': handler retorna 200 sem reexecutar (idempotent)
 *
 *   2. Em retries (Cloud Tasks reentregando após HTTP 500):
 *      - Se task estiver 'queued' ou 'running' ou 'failed', re-claim incrementa
 *        attempt e marca running de novo. Handler reexecuta o trabalho.
 *      - Se task estiver 'completed', claim retorna 'already-completed' e a
 *        operação não roda de novo (poupando recursos e evitando side-effects
 *        duplicados como cobranças de crédito ou publicações duplicadas).
 *
 * Defesa em profundidade — Cloud Tasks já deduplica no enfileiramento via
 * taskName determinístico, mas o store nos protege também de:
 *   - taskName que expirou (>1h após delete) e foi reaproveitado;
 *   - cenários de Cloud Tasks reentregando antes do handler responder 200;
 *   - chamadas manuais aos endpoints (testes, scripts).
 */

import { firestore } from './google-persistence.js';
import { logger } from '../utils/logger.js';
import type { TaskType } from '../queue/cloud-tasks.js';
import { buildTaskId } from '../queue/cloud-tasks.js';

const COLLECTION = 'tasks';

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface TaskRecord {
  taskId: string;
  type: TaskType;
  jobId: string;
  stepId?: string;
  status: TaskStatus;
  attempt: number;
  enqueuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export type ClaimResult =
  | { status: 'new'; attempt: number; record: TaskRecord }
  | { status: 'already-completed'; record: TaskRecord };

export interface ClaimInput {
  type: TaskType;
  jobId: string;
  stepId?: string;
  payload: Record<string, unknown>;
}

function tasksCollection(): FirebaseFirestore.CollectionReference {
  return firestore().collection(COLLECTION);
}

/**
 * Claim atômico: cria a task se não existir, ou marca running e incrementa
 * attempt se já existir e ainda não terminou. Retorna 'already-completed'
 * se o trabalho já foi concluído (handler deve responder 200 e sair).
 */
export async function claimTask(input: ClaimInput): Promise<ClaimResult> {
  const taskId = buildTaskId(input.type, input.jobId, input.stepId);
  const ref = tasksCollection().doc(taskId);
  const now = new Date().toISOString();

  return firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);

    if (!snap.exists) {
      const fresh: TaskRecord = {
        taskId,
        type: input.type,
        jobId: input.jobId,
        ...(input.stepId ? { stepId: input.stepId } : {}),
        status: 'running',
        attempt: 1,
        enqueuedAt: now,
        startedAt: now,
        completedAt: null,
        error: null,
        payload: input.payload,
        metadata: {},
      };
      tx.set(ref, fresh);
      return { status: 'new' as const, attempt: 1, record: fresh };
    }

    const existing = snap.data() as TaskRecord;

    if (existing.status === 'completed') {
      return { status: 'already-completed' as const, record: existing };
    }

    // queued / running / failed → reexecuta. Cloud Tasks só faz retry se
    // recebermos HTTP 500, então este branch implica que a entrega anterior
    // falhou ou foi interrompida e o store foi deixado em estado não-final.
    const nextAttempt = (existing.attempt ?? 0) + 1;
    tx.update(ref, {
      status: 'running',
      attempt: nextAttempt,
      startedAt: now,
      error: null,
    });
    return {
      status: 'new' as const,
      attempt: nextAttempt,
      record: { ...existing, status: 'running', attempt: nextAttempt, startedAt: now },
    };
  });
}

/** Marca a task como completed. Best-effort — falha de write é logada e ignorada. */
export async function markCompleted(
  taskId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await tasksCollection().doc(taskId).update({
      status: 'completed',
      completedAt: new Date().toISOString(),
      error: null,
      metadata,
    });
  } catch (err) {
    logger.warn(`[TaskStore] markCompleted failed for ${taskId}: ${err}`);
  }
}

/** Marca a task como failed. Cloud Tasks fará retry se ainda houver budget. */
export async function markFailed(taskId: string, error: string): Promise<void> {
  try {
    await tasksCollection().doc(taskId).update({
      status: 'failed',
      completedAt: new Date().toISOString(),
      error,
    });
  } catch (err) {
    logger.warn(`[TaskStore] markFailed failed for ${taskId}: ${err}`);
  }
}

/** Lê o estado atual da task. Útil pra debug e admin endpoints. */
export async function getTask(taskId: string): Promise<TaskRecord | null> {
  const snap = await tasksCollection().doc(taskId).get();
  if (!snap.exists) return null;
  return snap.data() as TaskRecord;
}

/** Verifica se Firestore está disponível pro store funcionar. */
export function isTaskStoreAvailable(): boolean {
  return Boolean(process.env.GOOGLE_CLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID);
}
