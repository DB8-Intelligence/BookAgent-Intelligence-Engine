/**
 * Cloud Tasks Adapter — fila async via Google Cloud Tasks
 *
 * Substitui BullMQ/Redis. Fluxo:
 *   1. enqueueTask(url, payload) cria uma task Cloud Tasks
 *   2. Cloud Tasks faz POST HTTP pro URL especificado (self-service webhook)
 *   3. O endpoint (em src/api/routes/internal.ts) processa a task inline
 *
 * Auth request: Cloud Tasks inclui OIDC Bearer token. O endpoint valida com
 * google-auth-library pra garantir que só o Cloud Tasks pode chamar.
 *
 * Vantagens vs BullMQ/Redis:
 *   - Zero infra de cache (Cloud Tasks é managed)
 *   - Autoscale nativo (múltiplas instâncias Cloud Run dividem tasks)
 *   - Retries built-in (exponential backoff configurável)
 *   - Dead letter queue via Cloud Tasks config
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
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[CloudTasks] createTask failed: ${msg}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// High-level helpers — usados pelo processController e videoRenderController
// ---------------------------------------------------------------------------

const PIPELINE_QUEUE = 'bookagent-pipeline';
const VIDEO_QUEUE = 'bookagent-video';

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

/** Enfileira uma execução do pipeline completo. */
export async function enqueuePipelineTask(payload: PipelineTaskPayload): Promise<string> {
  const baseUrl = process.env.CLOUD_TASKS_TARGET_URL;
  if (!baseUrl) throw new Error('[CloudTasks] CLOUD_TASKS_TARGET_URL not set');
  return enqueueTask({
    queueName: process.env.CLOUD_TASKS_PIPELINE_QUEUE ?? PIPELINE_QUEUE,
    targetUrl: `${baseUrl.replace(/\/$/, '')}/internal/execute-pipeline`,
    payload: payload as unknown as Record<string, unknown>,
    taskName: `pipeline-${payload.jobId}-${Date.now()}`,
  });
}

/** Enfileira uma renderização de vídeo. */
export async function enqueueVideoRenderTask(payload: VideoRenderTaskPayload): Promise<string> {
  const baseUrl = process.env.CLOUD_TASKS_TARGET_URL;
  if (!baseUrl) throw new Error('[CloudTasks] CLOUD_TASKS_TARGET_URL not set');
  return enqueueTask({
    queueName: process.env.CLOUD_TASKS_VIDEO_QUEUE ?? VIDEO_QUEUE,
    targetUrl: `${baseUrl.replace(/\/$/, '')}/internal/execute-video-render`,
    payload: payload as unknown as Record<string, unknown>,
    taskName: `video-${payload.jobId}-${payload.artifactId}-${Date.now()}`,
  });
}
