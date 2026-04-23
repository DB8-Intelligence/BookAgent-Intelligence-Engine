/**
 * Worker Entry Point — BookAgent Processing Queue
 *
 * Processo independente que consome jobs da fila BullMQ.
 * Roda como Cloud Run Service (always-on) com mini HTTP server pra health.
 *
 * BOOT NON-BLOCKING (crítico para Cloud Run startup probe):
 *   1. Abre HTTP health server em $PORT IMEDIATAMENTE (<100ms)
 *   2. Responde GET /health com 200 sempre (nunca falha startup probe)
 *   3. Bootstrap do Orchestrator + Redis workers acontece async em background
 *   4. Se Redis/Supabase demoram ou falham, /health fica em "degraded" mas
 *      o container continua UP — pode recuperar quando Redis voltar
 *
 * Uso:
 *   npm run worker         (desenvolvimento)
 *   node dist/worker.js    (produção)
 *
 * Env:
 *   REDIS_URL             (obrigatório; sem ele worker fica idle)
 *   SUPABASE_URL          (opcional; persistência)
 *   SUPABASE_SERVICE_ROLE_KEY (opcional; persistência)
 *   QUEUE_CONCURRENCY     (padrão: 2)
 *   AI_PROVIDER           (default vertex)
 *   PORT                  (default 8080; Cloud Run seta automaticamente)
 */

import { createServer } from 'node:http';
import type { Worker as BullMQWorker } from 'bullmq';
import { isRedisConfigured } from './queue/connection.js';
import { validateStartupSecrets, auditSecrets } from './utils/secrets.js';
import { createWorker } from './queue/worker.js';
import { createVideoWorker } from './queue/video-worker.js';
import { Orchestrator } from './core/orchestrator.js';
import { SupabaseClient } from './persistence/supabase-client.js';
import { JobRepository } from './persistence/job-repository.js';
import { ArtifactRepository } from './persistence/artifact-repository.js';
import { StorageManager } from './persistence/storage-manager.js';
import { logger } from './utils/logger.js';

import { IngestionModule } from './modules/ingestion/index.js';
import { BookCompatibilityAnalysisModule } from './modules/book-compatibility-analysis/index.js';
import { BookReverseEngineeringModule } from './modules/book-reverse-engineering/index.js';
import { AssetExtractionModule } from './modules/asset-extraction/index.js';
import { BrandingModule } from './modules/branding/index.js';
import { CorrelationModule } from './modules/correlation/index.js';
import { SourceIntelligenceModule } from './modules/source-intelligence/index.js';
import { NarrativeModule } from './modules/narrative/index.js';
import { OutputSelectionModule } from './modules/output-selection/index.js';
import { MediaGenerationModule } from './modules/media/index.js';
import { BlogModule } from './modules/blog/index.js';
import { LandingPageModule } from './modules/landing-page/index.js';
import { PersonalizationModule } from './modules/personalization/index.js';
import { RenderExportModule } from './modules/render-export/index.js';
import { DeliveryModule } from './modules/delivery/index.js';

// ============================================================================
// Mutable worker state (set by bootstrap, read by health endpoint)
// ============================================================================

interface WorkerState {
  pipelineWorker: BullMQWorker | null;
  videoWorker: BullMQWorker | null;
  supabaseClient: SupabaseClient | null;
  bootstrapStarted: boolean;
  bootstrapFinished: boolean;
  bootstrapError: string | null;
  redisConnected: boolean;
}

const state: WorkerState = {
  pipelineWorker: null,
  videoWorker: null,
  supabaseClient: null,
  bootstrapStarted: false,
  bootstrapFinished: false,
  bootstrapError: null,
  redisConnected: false,
};

// ============================================================================
// HEALTH SERVER — opens IMMEDIATELY, before any Redis/Supabase connection.
// Cloud Run startup probe succeeds within ~1s.
// ============================================================================

const healthPort = Number(process.env.PORT ?? process.env.WORKER_HEALTH_PORT ?? 8080);

const healthServer = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    // ALWAYS return 200 — even in degraded state. Cloud Run keeps the
    // container alive; body tells caller what's actually running.
    const body = {
      status: state.bootstrapFinished && state.redisConnected ? 'ok' : 'degraded',
      workers: {
        pipeline: state.pipelineWorker ? 'running' : 'stopped',
        videoRender: state.videoWorker ? 'running' : 'stopped',
      },
      bootstrap: {
        started: state.bootstrapStarted,
        finished: state.bootstrapFinished,
        error: state.bootstrapError,
      },
      redis: {
        configured: isRedisConfigured(),
        connected: state.redisConnected,
      },
      persistence: state.supabaseClient ? 'supabase' : 'in-memory',
      uptime: process.uptime(),
      secrets: auditSecrets(),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

healthServer.listen(healthPort, () => {
  logger.info(`[Worker] Health server listening on :${healthPort} — bootstrap starting async`);
  // Fire-and-forget bootstrap. If it throws, health endpoint reflects but
  // HTTP server keeps responding — container stays up.
  bootstrap().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    state.bootstrapError = msg;
    state.bootstrapFinished = true;
    logger.error(`[Worker] Bootstrap failed (non-fatal): ${msg}`);
  });
});

// ============================================================================
// ASYNC BOOTSTRAP — runs after HTTP server is listening
// ============================================================================

async function bootstrap(): Promise<void> {
  state.bootstrapStarted = true;
  logger.info('[Worker] Bootstrap started');

  // 1. Validate secrets (log only, never throws)
  validateStartupSecrets();

  // 2. Setup Orchestrator with all 15 pipeline modules
  const orchestrator = new Orchestrator();
  orchestrator.registerModule(new IngestionModule());
  orchestrator.registerModule(new BookCompatibilityAnalysisModule());
  orchestrator.registerModule(new BookReverseEngineeringModule());
  orchestrator.registerModule(new AssetExtractionModule());
  orchestrator.registerModule(new BrandingModule());
  orchestrator.registerModule(new CorrelationModule());
  orchestrator.registerModule(new SourceIntelligenceModule());
  orchestrator.registerModule(new NarrativeModule());
  orchestrator.registerModule(new OutputSelectionModule());
  orchestrator.registerModule(new MediaGenerationModule());
  orchestrator.registerModule(new BlogModule());
  orchestrator.registerModule(new LandingPageModule());
  orchestrator.registerModule(new PersonalizationModule());
  orchestrator.registerModule(new RenderExportModule());
  orchestrator.registerModule(new DeliveryModule());

  // 3. Supabase persistence (optional — graceful degradation)
  state.supabaseClient = SupabaseClient.tryFromEnv();
  const jobRepo = state.supabaseClient ? new JobRepository(state.supabaseClient) : null;
  const artifactRepo = state.supabaseClient ? new ArtifactRepository(state.supabaseClient) : null;
  const storageManager = new StorageManager();

  storageManager.ensureDirectories().catch((err) => {
    logger.warn(`[Worker] Failed to create storage dirs: ${err}`);
  });

  if (state.supabaseClient) {
    logger.info('[Worker] Persistence: Supabase');
  } else {
    logger.info('[Worker] Persistence: in-memory only (SUPABASE_URL not set)');
  }

  // 4. Redis check — without Redis the worker can't consume jobs, but the
  // container stays up so you can see the problem via /health.
  if (!isRedisConfigured()) {
    logger.warn(
      '[Worker] REDIS_URL not set — worker will not consume jobs. ' +
      'Add REDIS_URL via Secret Manager and the next container boot will connect.',
    );
    state.bootstrapFinished = true;
    return;
  }

  // 5. Create BullMQ workers
  try {
    const pipelineWorker = createWorker({
      orchestrator,
      jobRepo,
      artifactRepo,
      storageManager,
      supabaseClient: state.supabaseClient,
    });

    if (!pipelineWorker) {
      logger.error('[Worker] createWorker returned null — Redis connection failed');
      state.bootstrapError = 'Pipeline worker failed to initialize (Redis issue)';
      state.bootstrapFinished = true;
      return;
    }

    state.pipelineWorker = pipelineWorker;
    state.redisConnected = true;

    const videoWorker = createVideoWorker({
      supabase: state.supabaseClient,
      outputDir: 'storage/outputs/video',
      tempDir: 'storage/temp/video',
    });

    if (videoWorker) {
      state.videoWorker = videoWorker;
      logger.info('[Worker] Video render worker started');
    } else {
      logger.info('[Worker] Video render worker not started');
    }

    logger.info('[Worker] Bootstrap complete — consuming BullMQ jobs');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.bootstrapError = msg;
    logger.error(`[Worker] Failed to create workers: ${msg}`);
  }

  state.bootstrapFinished = true;
}

// ============================================================================
// Graceful shutdown
// ============================================================================

async function shutdown(signal: string): Promise<void> {
  logger.info(`[Worker] Received ${signal}. Shutting down gracefully...`);
  await Promise.all([
    state.pipelineWorker?.close(),
    state.videoWorker?.close(),
    new Promise<void>((resolve) => healthServer.close(() => resolve())),
  ]);
  logger.info('[Worker] All workers stopped. In-flight jobs completed.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
