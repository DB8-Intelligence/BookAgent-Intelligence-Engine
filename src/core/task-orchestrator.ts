/**
 * Task Orchestrator — Pub/Sub-based coordination
 *
 * Complementa o Pipeline sequencial com um modelo event-driven: módulos
 * "publicam" quando terminam (ex: NARRATIVE_READY) e workers "escutam"
 * tópicos e iniciam tarefas em paralelo automaticamente.
 *
 * Exemplo do fluxo que o user pediu:
 *   1. NarrativeModule termina → publica SCRIPT_READY
 *   2. AudioWorker escuta SCRIPT_READY → começa TTS (em paralelo)
 *   3. ImageWorker escuta SCRIPT_READY → começa processamento de imagens (paralelo)
 *   4. VideoRenderer escuta AUDIO_READY + IMAGES_READY (ambos) → começa render
 *
 * Hoje rodando in-memory via InMemoryEventBus. Para produção multi-instância,
 * trocar o bus por GCP Pub/Sub no bootstrap (src/index.ts) — sem mudar este
 * arquivo.
 *
 * Status: INFRAESTRUTURA PRONTA. Workers concretos ainda não implementados —
 * este arquivo define o CONTRATO (tópicos, payloads, inscrições) e o orchestrator
 * que faz wiring. Os módulos existentes continuam rodando sequencialmente no
 * Pipeline; para adotar o pattern, cada módulo precisa ser portado num PR
 * separado (fora do escopo deste commit).
 */

import { getEventBus, PipelineTopic, type IEventBus, type EventHandler } from './event-bus.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Event payloads — contrato entre publishers e subscribers
// ---------------------------------------------------------------------------

export interface PDFIngestedEvent {
  jobId: string;
  filePath: string;
  extractedText: string;
  pageCount: number;
}

export interface AssetsExtractedEvent {
  jobId: string;
  assetIds: string[];
  assetUrlMap: Record<string, string>;
}

export interface ScriptReadyEvent {
  jobId: string;
  narrativePlanIds: string[];
  /** Roteiro(s) finais prontos para TTS + imagem — o que o user chamou de SCRIPT_READY */
  scripts: Array<{ narrativeId: string; title: string; wordCount: number }>;
}

export interface MediaPlanReadyEvent {
  jobId: string;
  mediaPlanIds: string[];
}

export interface RenderStartedEvent {
  jobId: string;
  artifactId: string;
  format: string;
}

export interface RenderCompletedEvent {
  jobId: string;
  artifactId: string;
  outputPath: string;
  durationMs: number;
  sizeBytes: number;
}

export interface PipelineFailedEvent {
  jobId: string;
  stage: string;
  error: string;
}

/** Genéricos — emitidos em TODAS as transições de stage. */
export interface StageStartedEvent {
  jobId: string;
  stage: string;
  stageIndex: number;
  totalStages: number;
}

export interface StageCompletedEvent {
  jobId: string;
  stage: string;
  stageIndex: number;
  totalStages: number;
  durationMs: number;
}

export interface PipelineCompletedEvent {
  jobId: string;
  totalDurationMs: number;
  outputCount: number;
}

// ---------------------------------------------------------------------------
// TaskOrchestrator
// ---------------------------------------------------------------------------

export interface TaskWorkerRegistration {
  name: string;
  topic: string;
  handler: EventHandler;
}

export class TaskOrchestrator {
  private readonly bus: IEventBus;
  private readonly workers: TaskWorkerRegistration[] = [];
  private readonly unsubscribers: Array<() => void> = [];

  constructor(bus?: IEventBus) {
    this.bus = bus ?? getEventBus();
  }

  /**
   * Registra um worker que escuta um tópico.
   * Workers rodam em paralelo quando o tópico é publicado.
   */
  registerWorker(reg: TaskWorkerRegistration): void {
    const unsub = this.bus.subscribe(reg.topic, reg.handler);
    this.unsubscribers.push(unsub);
    this.workers.push(reg);
    logger.info(`[TaskOrchestrator] Registered worker "${reg.name}" on topic "${reg.topic}"`);
  }

  /**
   * Emite um evento para os workers escutando.
   * Fire-and-forget — não bloqueia; mas aguarda todos os handlers
   * do mesmo tópico (Promise.all).
   */
  async publish<T>(
    topic: string,
    payload: T,
    opts?: { jobId?: string; correlationId?: string },
  ): Promise<void> {
    return this.bus.publish(topic, payload, opts);
  }

  /**
   * Aguarda um tópico específico ser publicado com filtro opcional.
   * Útil para sincronizar pontos do pipeline (ex: aguardar render completar).
   */
  waitFor<T>(
    topic: string,
    predicate: (payload: T) => boolean,
    timeoutMs = 300_000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new Error(`[TaskOrchestrator] Timeout waiting for ${topic} after ${timeoutMs}ms`));
      }, timeoutMs);

      const unsub = this.bus.subscribe<T>(topic, (msg) => {
        if (predicate(msg.payload)) {
          clearTimeout(timer);
          unsub();
          resolve(msg.payload);
        }
      });
    });
  }

  /**
   * Barreira: espera TODOS os tópicos listados serem publicados (com o mesmo jobId).
   * Usado para fan-in depois de fan-out (ex: TTS + imagens prontas → render).
   */
  async waitForAll(topics: string[], jobId: string, timeoutMs = 600_000): Promise<void> {
    const promises = topics.map((t) =>
      this.waitFor<{ jobId: string }>(t, (p) => p.jobId === jobId, timeoutMs),
    );
    await Promise.all(promises);
  }

  /**
   * Lista workers registrados — útil para health check e debug.
   */
  listWorkers(): Array<{ name: string; topic: string }> {
    return this.workers.map((w) => ({ name: w.name, topic: w.topic }));
  }

  /**
   * Limpa todos os subscribers. Chamar no shutdown.
   */
  shutdown(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers.length = 0;
    this.workers.length = 0;
    logger.info('[TaskOrchestrator] All workers unsubscribed');
  }
}

// ---------------------------------------------------------------------------
// Helpers de emission — açúcar para o Pipeline chamar de dentro dos módulos
// ---------------------------------------------------------------------------

/**
 * Helpers tipados para módulos emitirem eventos sem precisar saber
 * o nome da string do tópico.
 *
 * Uso dentro do Pipeline.execute (próximo commit):
 *   await emitScriptReady(jobId, narratives);
 *   await emitAssetsExtracted(jobId, assets, urlMap);
 */
export async function emitPdfIngested(
  jobId: string,
  data: Omit<PDFIngestedEvent, 'jobId'>,
  bus: IEventBus = getEventBus(),
): Promise<void> {
  await bus.publish<PDFIngestedEvent>(PipelineTopic.PDF_INGESTED, { jobId, ...data }, { jobId });
}

export async function emitAssetsExtracted(
  jobId: string,
  data: Omit<AssetsExtractedEvent, 'jobId'>,
  bus: IEventBus = getEventBus(),
): Promise<void> {
  await bus.publish<AssetsExtractedEvent>(PipelineTopic.ASSETS_EXTRACTED, { jobId, ...data }, { jobId });
}

export async function emitScriptReady(
  jobId: string,
  data: Omit<ScriptReadyEvent, 'jobId'>,
  bus: IEventBus = getEventBus(),
): Promise<void> {
  // Publica em AMBOS tópicos (NARRATIVE_READY técnico + SCRIPT_READY semântico)
  await Promise.all([
    bus.publish<ScriptReadyEvent>(PipelineTopic.NARRATIVE_READY, { jobId, ...data }, { jobId }),
    bus.publish<ScriptReadyEvent>(PipelineTopic.SCRIPT_READY, { jobId, ...data }, { jobId }),
  ]);
}

export async function emitMediaPlanReady(
  jobId: string,
  data: Omit<MediaPlanReadyEvent, 'jobId'>,
  bus: IEventBus = getEventBus(),
): Promise<void> {
  await bus.publish<MediaPlanReadyEvent>(PipelineTopic.MEDIA_PLAN_READY, { jobId, ...data }, { jobId });
}

export async function emitRenderCompleted(
  jobId: string,
  data: Omit<RenderCompletedEvent, 'jobId'>,
  bus: IEventBus = getEventBus(),
): Promise<void> {
  await bus.publish<RenderCompletedEvent>(PipelineTopic.RENDER_COMPLETED, { jobId, ...data }, { jobId });
}

export async function emitPipelineFailed(
  jobId: string,
  data: Omit<PipelineFailedEvent, 'jobId'>,
  bus: IEventBus = getEventBus(),
): Promise<void> {
  await bus.publish<PipelineFailedEvent>(PipelineTopic.PIPELINE_FAILED, { jobId, ...data }, { jobId });
}

export async function emitStageStarted(
  jobId: string,
  data: Omit<StageStartedEvent, 'jobId'>,
  bus: IEventBus = getEventBus(),
): Promise<void> {
  await bus.publish<StageStartedEvent>(PipelineTopic.STAGE_STARTED, { jobId, ...data }, { jobId });
}

export async function emitStageCompleted(
  jobId: string,
  data: Omit<StageCompletedEvent, 'jobId'>,
  bus: IEventBus = getEventBus(),
): Promise<void> {
  await bus.publish<StageCompletedEvent>(PipelineTopic.STAGE_COMPLETED, { jobId, ...data }, { jobId });
}

export async function emitPipelineCompleted(
  jobId: string,
  data: Omit<PipelineCompletedEvent, 'jobId'>,
  bus: IEventBus = getEventBus(),
): Promise<void> {
  await bus.publish<PipelineCompletedEvent>(PipelineTopic.PIPELINE_COMPLETED, { jobId, ...data }, { jobId });
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let orchestratorInstance: TaskOrchestrator | null = null;

export function getTaskOrchestrator(): TaskOrchestrator {
  if (!orchestratorInstance) orchestratorInstance = new TaskOrchestrator();
  return orchestratorInstance;
}
