/**
 * Event Bus — Pub/Sub façade
 *
 * Abstração de mensageria assíncrona. Hoje roda in-memory (EventEmitter),
 * amanhã troca pro Google Cloud Pub/Sub ou Redis Streams sem alterar
 * o código que publica/escuta — só substitui o driver.
 *
 * Contract (interface IEventBus):
 *   publish(topic, message)   — fire-and-forget, aguarda todos subscribers
 *   subscribe(topic, handler) — retorna unsubscribe function
 *   once(topic, handler)      — escuta só o próximo evento
 *
 * Tópicos usados pelo pipeline (em src/core/task-orchestrator.ts):
 *   - PDF_INGESTED
 *   - ASSETS_EXTRACTED
 *   - NARRATIVE_READY       (aka SCRIPT_READY)
 *   - OUTPUTS_SELECTED
 *   - MEDIA_PLAN_READY
 *   - BLOG_PLAN_READY
 *   - LANDING_PAGE_READY
 *   - RENDER_STARTED
 *   - RENDER_COMPLETED
 *   - PIPELINE_FAILED
 *
 * Design:
 *   - Handlers rodam em paralelo (Promise.all) dentro de publish()
 *   - Errors em handlers são logged mas não derrubam o publisher
 *   - O driver padrão é in-memory; trocar pra Pub/Sub é substituir
 *     `defaultEventBus` pelo `GcpPubSubBus` (a criar).
 */

import { EventEmitter } from 'node:events';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

export const PipelineTopic = {
  PDF_INGESTED: 'pipeline.pdf_ingested',
  ASSETS_EXTRACTED: 'pipeline.assets_extracted',
  NARRATIVE_READY: 'pipeline.narrative_ready',
  SCRIPT_READY: 'pipeline.script_ready', // alias semântico do user
  OUTPUTS_SELECTED: 'pipeline.outputs_selected',
  MEDIA_PLAN_READY: 'pipeline.media_plan_ready',
  BLOG_PLAN_READY: 'pipeline.blog_plan_ready',
  LANDING_PAGE_READY: 'pipeline.landing_page_ready',
  RENDER_STARTED: 'pipeline.render_started',
  RENDER_COMPLETED: 'pipeline.render_completed',
  PIPELINE_FAILED: 'pipeline.pipeline_failed',
} as const;

export type PipelineTopicKey = typeof PipelineTopic[keyof typeof PipelineTopic];

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface EventMessage<T = unknown> {
  topic: string;
  payload: T;
  jobId?: string;
  publishedAt: string;
  correlationId?: string;
}

export type EventHandler<T = unknown> = (msg: EventMessage<T>) => Promise<void> | void;

export interface IEventBus {
  publish<T>(topic: string, payload: T, opts?: { jobId?: string; correlationId?: string }): Promise<void>;
  subscribe<T>(topic: string, handler: EventHandler<T>): () => void;
  once<T>(topic: string, handler: EventHandler<T>): void;
}

// ---------------------------------------------------------------------------
// In-memory driver (default)
// ---------------------------------------------------------------------------

export class InMemoryEventBus implements IEventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Raise default listener limit (pipeline + workers can add many)
    this.emitter.setMaxListeners(100);
  }

  async publish<T>(
    topic: string,
    payload: T,
    opts?: { jobId?: string; correlationId?: string },
  ): Promise<void> {
    const msg: EventMessage<T> = {
      topic,
      payload,
      jobId: opts?.jobId,
      correlationId: opts?.correlationId,
      publishedAt: new Date().toISOString(),
    };

    const listeners = this.emitter.listeners(topic) as EventHandler<T>[];

    logger.debug(
      `[EventBus] publish ${topic} — ${listeners.length} listeners` +
      (opts?.jobId ? ` (job=${opts.jobId})` : ''),
    );

    if (listeners.length === 0) return;

    // Fire-and-forget but wait for all handlers; swallow errors per-handler
    await Promise.all(
      listeners.map(async (h) => {
        try {
          await h(msg);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.warn(`[EventBus] handler for ${topic} threw: ${errMsg}`);
        }
      }),
    );
  }

  subscribe<T>(topic: string, handler: EventHandler<T>): () => void {
    this.emitter.on(topic, handler as EventHandler);
    return () => this.emitter.off(topic, handler as EventHandler);
  }

  once<T>(topic: string, handler: EventHandler<T>): void {
    this.emitter.once(topic, handler as EventHandler);
  }
}

// ---------------------------------------------------------------------------
// Default singleton (swap out in main for GCP Pub/Sub later)
// ---------------------------------------------------------------------------

let instance: IEventBus | null = null;

export function getEventBus(): IEventBus {
  if (!instance) instance = new InMemoryEventBus();
  return instance;
}

/** Permite injetar outro driver (ex: GcpPubSubBus) no bootstrap. */
export function setEventBus(bus: IEventBus): void {
  instance = bus;
}
