/**
 * Worker Entry Point — BookAgent Processing Queue
 *
 * Processo independente que consome jobs da fila BullMQ.
 * Pode rodar na mesma máquina que o API server ou em Railway separado.
 *
 * Uso:
 *   npm run worker         (desenvolvimento)
 *   node dist/worker.js    (produção)
 *
 * Requisitos:
 *   REDIS_URL ou REDIS_HOST  (obrigatório)
 *
 * Opcionais:
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  (persistência no banco)
 *   QUEUE_CONCURRENCY                          (padrão: 2)
 *   AI_PROVIDER + chaves de IA                (geração real de conteúdo)
 *   TTS_PROVIDER + TTS_SYNTHESIS_ENABLED      (síntese de áudio)
 */

import { isRedisConfigured } from './queue/connection.js';
import { createWorker } from './queue/worker.js';
import { Orchestrator } from './core/orchestrator.js';
import { SupabaseClient } from './persistence/supabase-client.js';
import { JobRepository } from './persistence/job-repository.js';
import { ArtifactRepository } from './persistence/artifact-repository.js';
import { StorageManager } from './persistence/storage-manager.js';
import { logger } from './utils/logger.js';

// --- Pipeline modules (todos os 15 estágios) ---
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
// Validar configuração
// ============================================================================

if (!isRedisConfigured()) {
  logger.error('[Worker] REDIS_URL or REDIS_HOST not configured. Worker cannot start.');
  process.exit(1);
}

// ============================================================================
// Montar Orchestrator com todos os módulos
// ============================================================================

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

// ============================================================================
// Persistência (opcional — graceful degradation se Supabase não configurado)
// ============================================================================

const supabaseClient = SupabaseClient.tryFromEnv();
const jobRepo        = supabaseClient ? new JobRepository(supabaseClient)      : null;
const artifactRepo   = supabaseClient ? new ArtifactRepository(supabaseClient) : null;
const storageManager = new StorageManager();

// Garantir diretórios de storage
storageManager.ensureDirectories().catch((err) => {
  logger.warn(`[Worker] Failed to create storage directories: ${err}`);
});

if (supabaseClient) {
  logger.info('[Worker] Persistence: Supabase (jobs + artifacts will be persisted)');
} else {
  logger.info('[Worker] Persistence: in-memory only (SUPABASE_URL not configured)');
}

// ============================================================================
// Iniciar Worker
// ============================================================================

const worker = createWorker({
  orchestrator,
  jobRepo,
  artifactRepo,
  storageManager,
});

if (!worker) {
  logger.error('[Worker] Failed to create worker (Redis connection failed).');
  process.exit(1);
}

logger.info('[Worker] BookAgent worker running. Waiting for jobs...');

// ============================================================================
// Graceful shutdown
// ============================================================================

async function shutdown(signal: string): Promise<void> {
  logger.info(`[Worker] Received ${signal}. Shutting down gracefully...`);

  // Parar de aceitar novos jobs, aguardar os em andamento
  await worker?.close();
  logger.info('[Worker] Worker stopped. All in-flight jobs completed.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
