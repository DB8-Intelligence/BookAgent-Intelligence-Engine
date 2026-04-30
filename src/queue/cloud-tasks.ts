/**
 * Cloud Tasks Adapter — fila async via Google Cloud Tasks
 *
 * Substitui BullMQ/Redis. Fluxo:
 *   1. enqueueTask(url, payload) cria uma task Cloud Tasks
 *   2. Cloud Tasks faz POST HTTP pro URL especificado (self-service webhook)
 *   3. O endpoint (em src/api/routes/tasks.ts) processa a task
 *
 * Auth request: Cloud Tasks inclui OIDC Bearer token. O endpoint valida com
 * google-auth-library pra garantir que só o Cloud Tasks pode chamar.
 *
 * Idempotência:
 *   taskName é determinístico (${type}:${jobId}[:${stepId}] sanitizado).
 *   Cloud Tasks rejeita um createTask com taskName já existente — bloqueio
 *   duro contra duplicidade de enfileiramento. Quando uma task termina e é
 *   deletada, o nome fica reservado por ~1h, o que é desejável: jobs em
 *   janela curta não são reenfileirados acidentalmente.
 *
 * Env vars:
 *   CLOUD_TASKS_QUEUE       — nome da queue (ex: "bookagent-pipeline")
 *   CLOUD_TASKS_LOCATION    — região da queue (ex: "us-central1")
 *   CLOUD_TASKS_SA_EMAIL    — SA que o Cloud Tasks usa pra gerar OIDC token
 *   CLOUD_TASKS_TARGET_URL  — URL base do serviço que recebe as tasks
 *   GOOGLE_CLOUD_PROJECT    — project ID (compartilhado com Vertex/GCS)
 *
 * Setup (uma vez no GCP):
 *   gcloud tasks queues create bookagent-pipeline --location=us-central1
 *   gcloud tasks queues create bookagent-video --location=us-central1
 */

import { CloudTasksClient } from '@google-cloud/tasks';
import { logger } from '../utils/logger.js';

export type TaskType = 'pipeline' | 'video' | 'editorial' | 'publication' | 'cleanup';

export interface EnqueueTaskInput {
  /** Queue name (bookagent-pipeline, bookagent-video, etc.) */
  queueName: string;
  /** URL que Cloud Tasks vai POST com o payload */
  targetUrl: string;
  /** Payload JSON da task */
  payload: Record<string, unknown>;
  /** Delay opcional antes de processar (ms) */
  delaySeconds?: number;
  /** Task name custom (pra deduplicar). Se omitido, Cloud Tasks gera */
  taskName?: string;
}

let client: CloudTasksClient | null = null;

/** Lazy singleton do Cloud Tasks client. */
function getClient(): CloudTasksClient {
  if (!client) client = new CloudTasksClient();
  return client;
}

/** Verifica se Cloud Tasks está configurado (env vars presentes) */
export function isCloudTasksConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLOUD_PROJECT &&
    process.env.CLOUD_TASKS_LOCATION &&
    process.env.CLOUD_TASKS_SA_EMAIL &&
    process.env.CLOUD_TASKS_TARGET_URL,
  );
}

// ---------------------------------------------------------------------------
// Task identity helpers
// ---------------------------------------------------------------------------

/**
 * Constrói o taskId determinístico usado no Firestore (`tasks/{taskId}`)
 * e como base para o taskName do Cloud Tasks.
 *
 * Formato: `${type}:${jobId}` ou `${type}:${jobId}:${stepId}`.
 */
export function buildTaskId(type: TaskType, jobId: string, stepId?: string): string {
  return stepId ? `${type}:${jobId}:${stepId}` : `${type}:${jobId}`;
}

/**
 * Converte um taskId no formato da convenção interna pra um taskName válido
 * em Cloud Tasks (regex `[A-Za-z0-9_-]`). Usa `--` no lugar de `:` pra
 * preservar a estrutura visual e evitar colisão com hífens internos do UUID.
 */
export function taskIdToCloudTasksName(taskId: string): string {
  return taskId.replace(/:/g, '--').replace(/[^A-Za-z0-9_-]/g, '_');
}

/**
 * Enfileira uma task Cloud Tasks.
 * Retorna o nome completo da task (ex: projects/.../tasks/...).
 */
export async function enqueueTask(input: EnqueueTaskInput): Promise<string> {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.CLOUD_TASKS_LOCATION ?? 'us-central1';
  const saEmail = process.env.CLOUD_TASKS_SA_EMAIL;

  if (!project) throw new Error('[CloudTasks] GOOGLE_CLOUD_PROJECT not set');
  if (!saEmail) throw new Error('[CloudTasks] CLOUD_TASKS_SA_EMAIL not set');

  const parent = getClient().queuePath(project, location, input.queueName);

  const body = Buffer.from(JSON.stringify(input.payload)).toString('base64');

  const task: Record<string, unknown> = {
    httpRequest: {
      httpMethod: 'POST',
      url: input.targetUrl,
      headers: { 'Content-Type': 'application/json' },
      body,
      // OIDC auth — Cloud Tasks mints a token on behalf of this SA and
      // the receiving endpoint validates it with google-auth-library.
      oidcToken: {
        serviceAccountEmail: saEmail,
        audience: input.targetUrl,
      },
    },
  };

  if (input.delaySeconds && input.delaySeconds > 0) {
    task.scheduleTime = {
      seconds: Math.floor(Date.now() / 1000) + input.delaySeconds,
    };
  }

  if (input.taskName) {
    task.name = `${parent}/tasks/${input.taskName}`;
  }

  try {
    const [response] = await getClient().createTask({ parent, task });
    logger.info(`[CloudTasks] Enqueued ${response.name} → ${input.targetUrl}`);
    return response.name ?? '';
  } catch (err) {
    // ALREADY_EXISTS = task com mesmo nome já criada (idempotência funcionou).
    // Logamos como info, não como error: enqueue duplicado é o comportamento desejado.
    const errorObj = err as { code?: number; message?: string };
    if (errorObj?.code === 6) {
      logger.info(
        `[CloudTasks] Task already exists (dedup): ${input.taskName ?? '<no-name>'} ` +
        `→ ${input.targetUrl}`,
      );
      return input.taskName
        ? `${parent}/tasks/${input.taskName}`
        : '';
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[CloudTasks] createTask failed: ${msg}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// High-level helpers — usados por controllers e job processor
// ---------------------------------------------------------------------------

const PIPELINE_QUEUE = 'bookagent-pipeline';
const VIDEO_QUEUE = 'bookagent-video';
const EDITORIAL_QUEUE = 'bookagent-pipeline';     // reusa a queue padrão (mesmo perfil de retry)
const PUBLICATION_QUEUE = 'bookagent-pipeline';   // idem
const CLEANUP_QUEUE = 'bookagent-pipeline';       // idem

export interface PipelineTaskPayload {
  jobId: string;
  fileUrl: string;
  type: string;
  userContext: Record<string, string | undefined>;
  webhookUrl?: string;
  tenantContext?: {
    tenantId: string;
    userId: string;
    planTier: string;
    learningScope: string;
  };
}

export interface VideoRenderTaskPayload {
  jobId: string;
  artifactId: string;
  renderSpecJson: string;
  assetUrls: Record<string, string>;
}

export interface EditorialTaskPayload {
  jobId: string;
  stepName: string;
  attempt?: number;
}

export interface PublicationTaskPayload {
  jobId: string;
  userId: string;
  decision: 'approved' | 'rejected' | 'comment';
  comment: string;
  sourceChannel: string;
  approvalRound: number;
  approvalType?: 'intermediate' | 'final';
  forcePublish?: boolean;
  platforms?: string[];
}

export interface CleanupTaskPayload {
  scope: string;
  reference?: string;
  metadata?: Record<string, unknown>;
}

function targetUrlBase(): string {
  const baseUrl = process.env.CLOUD_TASKS_TARGET_URL;
  if (!baseUrl) throw new Error('[CloudTasks] CLOUD_TASKS_TARGET_URL not set');
  return baseUrl.replace(/\/$/, '');
}

/** Enfileira uma execução do pipeline completo. */
export async function enqueuePipelineTask(payload: PipelineTaskPayload): Promise<string> {
  const taskId = buildTaskId('pipeline', payload.jobId);
  return enqueueTask({
    queueName: process.env.CLOUD_TASKS_PIPELINE_QUEUE ?? PIPELINE_QUEUE,
    targetUrl: `${targetUrlBase()}/tasks/pipeline`,
    payload: payload as unknown as Record<string, unknown>,
    taskName: taskIdToCloudTasksName(taskId),
  });
}

/** Enfileira uma renderização de vídeo. */
export async function enqueueVideoRenderTask(payload: VideoRenderTaskPayload): Promise<string> {
  const taskId = buildTaskId('video', payload.jobId, payload.artifactId);
  return enqueueTask({
    queueName: process.env.CLOUD_TASKS_VIDEO_QUEUE ?? VIDEO_QUEUE,
    targetUrl: `${targetUrlBase()}/tasks/video`,
    payload: payload as unknown as Record<string, unknown>,
    taskName: taskIdToCloudTasksName(taskId),
  });
}

/** Enfileira a execução de um step editorial (book-editorial bounded context). */
export async function enqueueEditorialTask(payload: EditorialTaskPayload): Promise<string> {
  const taskId = buildTaskId('editorial', payload.jobId, payload.stepName);
  return enqueueTask({
    queueName: process.env.CLOUD_TASKS_EDITORIAL_QUEUE ?? EDITORIAL_QUEUE,
    targetUrl: `${targetUrlBase()}/tasks/editorial`,
    payload: payload as unknown as Record<string, unknown>,
    taskName: taskIdToCloudTasksName(taskId),
  });
}

/**
 * Enfileira a publicação de um job (notificação n8n + redes sociais).
 * Substitui chamadas inline a triggerN8nApproval no approvalController.
 */
export async function enqueuePublicationTask(payload: PublicationTaskPayload): Promise<string> {
  // Inclui approvalRound + decision no taskId pra permitir múltiplas
  // decisões sobre o mesmo job (round 1 reject → round 2 approve).
  const stepId = `${payload.approvalRound}-${payload.decision}`;
  const taskId = buildTaskId('publication', payload.jobId, stepId);
  return enqueueTask({
    queueName: process.env.CLOUD_TASKS_PUBLICATION_QUEUE ?? PUBLICATION_QUEUE,
    targetUrl: `${targetUrlBase()}/tasks/publication`,
    payload: payload as unknown as Record<string, unknown>,
    taskName: taskIdToCloudTasksName(taskId),
  });
}

/** Enfileira uma task de cleanup. Reservado pra futuras rotinas (framework only). */
export async function enqueueCleanupTask(payload: CleanupTaskPayload): Promise<string> {
  const taskId = buildTaskId('cleanup', payload.scope, payload.reference);
  return enqueueTask({
    queueName: process.env.CLOUD_TASKS_CLEANUP_QUEUE ?? CLEANUP_QUEUE,
    targetUrl: `${targetUrlBase()}/tasks/cleanup`,
    payload: payload as unknown as Record<string, unknown>,
    taskName: taskIdToCloudTasksName(taskId),
  });
}
