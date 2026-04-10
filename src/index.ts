/**
 * BookAgent Intelligence Engine — Entry Point
 *
 * Inicializa o servidor Express, registra os módulos no pipeline
 * e configura as rotas da API.
 *
 * Quando SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY estão configurados,
 * usa PersistentOrchestrator que persiste jobs, artifacts e eventos no banco.
 * Caso contrário, usa Orchestrator in-memory (modo standalone).
 *
 * Endpoints:
 *   GET  /health                                    → Health check + status de providers
 *   POST /api/v1/process                            → Iniciar processamento
 *   GET  /api/v1/jobs                               → Listar jobs
 *   GET  /api/v1/jobs/:jobId                        → Detalhe do job
 *   GET  /api/v1/jobs/:jobId/sources                → Sources do job
 *   GET  /api/v1/jobs/:jobId/plans                  → Planos do job
 *   GET  /api/v1/jobs/:jobId/artifacts              → Artifacts do job
 *   GET  /api/v1/jobs/:jobId/artifacts/:id          → Detalhe do artifact
 *   GET  /api/v1/jobs/:jobId/artifacts/:id/download → Download do artifact
 *   POST /api/v1/leads/register                     → Registrar lead (Fluxo 7)
 *   GET  /api/v1/leads/:phone                       → Dados do lead
 *   PATCH /api/v1/leads/:phone/stage                → Atualizar estágio do funil
 *   POST /api/v1/leads/:phone/event                 → Log de evento
 *   POST /api/v1/leads/:phone/demo                  → Incrementar uso de demo (trial)
 *   GET  /api/v1/ops/dashboard                      → Dashboard operacional (protegido)
 *   GET  /api/v1/ops/queue                          → Saúde da fila BullMQ
 *   GET  /api/v1/ops/costs                          → Análise de custos e margem
 *   GET  /api/v1/ops/growth                         → Fase de crescimento e recomendações
 */

import express from 'express';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { Orchestrator } from './core/orchestrator.js';
import { SupabaseClient } from './persistence/supabase-client.js';
import { PersistentOrchestrator } from './persistence/persistent-orchestrator.js';
import { StorageManager } from './persistence/storage-manager.js';
import { checkProviderStatus } from './adapters/provider-factory.js';

// --- Controllers (dependency injection) ---
import { setOrchestrator as setProcessOrch, setProcessJobRepository } from './api/controllers/processController.js';
import { setOrchestrator as setJobsOrch, setJobRepository } from './api/controllers/jobsController.js';
import { setOrchestrator as setArtifactsOrch } from './api/controllers/artifactsController.js';
import { setSupabaseClientForApproval } from './api/controllers/approvalController.js';
import { setSupabaseClientForExperiments } from './api/controllers/experimentController.js';
import { setSupabaseClientForBilling } from './api/controllers/billingController.js';
import { setSupabaseClientForAdmin } from './api/controllers/adminController.js';
import { setSupabaseClientForCustomerDashboard } from './api/controllers/customerDashboardController.js';
import { setSupabaseClientForAnalytics } from './api/controllers/analyticsController.js';
import { setSupabaseClientForInsights } from './api/controllers/insightsController.js';
import { setSupabaseClientForTemplates } from './api/controllers/templateMarketplaceController.js';
import { setSupabaseClientForStrategy } from './api/controllers/strategyController.js';
import { setSupabaseClientForCampaigns } from './api/controllers/campaignController.js';
import { setSupabaseClientForScheduling } from './api/controllers/scheduleController.js';
import { setSupabaseClientForExecution } from './api/controllers/executionController.js';
import { setSupabaseClientForGovernance } from './api/controllers/governanceController.js';
import { setSupabaseClientForOptimization } from './api/controllers/optimizationController.js';
import { setSupabaseClientForGoals } from './api/controllers/goalOptimizationController.js';
import { setSupabaseClientForMemory } from './api/controllers/memoryController.js';
import { setSupabaseClientForRecovery } from './api/controllers/recoveryController.js';
import { setSupabaseClientForKnowledgeGraph } from './api/controllers/knowledgeGraphController.js';
import { setSupabaseClientForSimulation } from './api/controllers/simulationController.js';
import { setSupabaseClientForDecisions } from './api/controllers/decisionController.js';
import { setSupabaseClientForCoPilot } from './api/controllers/copilotController.js';
import { setTenantGuardSupabaseClient, tenantGuard } from './api/middleware/tenant-guard.js';
import { setVideoRenderSupabaseClient } from './api/controllers/videoRenderController.js';
import { setPlanGuardSupabaseClient } from './api/middleware/plan-guard.js';
import { setLeadsSupabaseClient } from './api/controllers/leadsController.js';
import { setOpsSupabaseClient } from './api/controllers/opsController.js';
import { setKiwifyWebhookClient } from './api/controllers/kiwifyWebhookController.js';
import { metrics } from './observability/metrics.js';

// --- Queue ---
import { getQueue, QUEUE_NAME } from './queue/queue.js';
import { isRedisConfigured } from './queue/connection.js';
import { JobRepository } from './persistence/job-repository.js';

// --- Routes ---
import processRoutes from './api/routes/process.js';
import jobsRoutes from './api/routes/jobs.js';
import approvalRoutes from './api/routes/approval.js';
import leadsRoutes from './api/routes/leads.js';
import opsRoutes from './api/routes/ops.js';
import experimentRoutes from './api/routes/experiments.js';
import billingRoutes from './api/routes/billing.js';
import webhooksRoutes from './api/routes/webhooks.js';
import adminRoutes from './api/routes/admin.js';
import analyticsRoutes from './api/routes/analytics.js';
import insightsRoutes from './api/routes/insights.js';
import templateRoutes from './api/routes/templates.js';
import strategyRoutes from './api/routes/strategy.js';
import campaignRoutes from './api/routes/campaigns.js';
import scheduleRoutes, { calendarRouter } from './api/routes/schedule.js';
import executionRoutes from './api/routes/execution.js';
import governanceRoutes from './api/routes/governance.js';
import optimizationRoutes from './api/routes/optimization.js';
import goalRoutes from './api/routes/goals.js';
import memoryRoutes from './api/routes/memory.js';
import recoveryRoutes from './api/routes/recovery.js';
import knowledgeGraphRoutes from './api/routes/knowledge-graph.js';
import simulationRoutes from './api/routes/simulation.js';
import decisionRoutes from './api/routes/decisions.js';
import copilotRoutes from './api/routes/copilot.js';
import customerDashboardRoutes from './api/routes/customer-dashboard.js';

// --- Middleware ---
import { errorHandler } from './api/middleware/error-handler.js';

// --- Módulos do Pipeline (15 estágios) ---
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
import { ContentScoringModule } from './modules/scoring/index.js';
import { DeliveryModule } from './modules/delivery/index.js';
import { PerformanceMonitoringModule } from './modules/performance/index.js';

// ============================================================================
// Bootstrap
// ============================================================================

// Garantir diretórios de storage ao iniciar
const storageManager = new StorageManager();
storageManager.ensureDirectories().catch((err) => {
  logger.warn(`[Bootstrap] Failed to create storage directories: ${err}`);
});

// Criar orchestrator base
const baseOrchestrator = new Orchestrator();

// Determinar se usar PersistentOrchestrator (com Supabase) ou base (in-memory)
let orchestrator: Orchestrator | PersistentOrchestrator;
let persistenceMode: 'supabase' | 'memory' = 'memory';

const supabaseClient = SupabaseClient.tryFromEnv();
if (supabaseClient) {
  orchestrator = new PersistentOrchestrator(baseOrchestrator, supabaseClient);
  persistenceMode = 'supabase';
  logger.info('[Bootstrap] Persistence mode: Supabase (jobs + artifacts will be persisted)');
} else {
  orchestrator = baseOrchestrator;
  logger.info('[Bootstrap] Persistence mode: in-memory (configure SUPABASE_URL to enable persistence)');
}

// Registrar todos os 15 módulos no pipeline (ordem definida em pipeline.ts)
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
orchestrator.registerModule(new ContentScoringModule());
orchestrator.registerModule(new RenderExportModule());
orchestrator.registerModule(new DeliveryModule());
orchestrator.registerModule(new PerformanceMonitoringModule());

// Compartilhar orchestrator com todos os controllers
setProcessOrch(orchestrator);
setJobsOrch(orchestrator);
setArtifactsOrch(orchestrator);

// Injetar JobRepository no jobsController (fallback para leitura no Supabase)
if (supabaseClient) {
  setJobRepository(new JobRepository(supabaseClient));
  setProcessJobRepository(new JobRepository(supabaseClient));
  setSupabaseClientForApproval(supabaseClient);
  setSupabaseClientForExperiments(supabaseClient);
  setSupabaseClientForBilling(supabaseClient);
  setSupabaseClientForAdmin(supabaseClient);
  setSupabaseClientForCustomerDashboard(supabaseClient);
  setSupabaseClientForAnalytics(supabaseClient);
  setSupabaseClientForInsights(supabaseClient);
  setSupabaseClientForTemplates(supabaseClient);
  setSupabaseClientForStrategy(supabaseClient);
  setSupabaseClientForCampaigns(supabaseClient);
  setSupabaseClientForScheduling(supabaseClient);
  setSupabaseClientForExecution(supabaseClient);
  setSupabaseClientForGovernance(supabaseClient);
  setSupabaseClientForOptimization(supabaseClient);
  setSupabaseClientForGoals(supabaseClient);
  setSupabaseClientForMemory(supabaseClient);
  setSupabaseClientForRecovery(supabaseClient);
  setSupabaseClientForKnowledgeGraph(supabaseClient);
  setSupabaseClientForSimulation(supabaseClient);
  setSupabaseClientForDecisions(supabaseClient);
  setSupabaseClientForCoPilot(supabaseClient);
  setTenantGuardSupabaseClient(supabaseClient);
  setVideoRenderSupabaseClient(supabaseClient);
  setPlanGuardSupabaseClient(supabaseClient);
  setLeadsSupabaseClient(supabaseClient);
  setOpsSupabaseClient(supabaseClient);
  setKiwifyWebhookClient(supabaseClient);
  metrics.setSupabaseClient(supabaseClient);
}

// Inicializar fila (se Redis configurado)
const queueMode = isRedisConfigured();
if (queueMode) {
  const q = getQueue();
  if (q) {
    logger.info(`[Bootstrap] Queue mode: BullMQ (queue="${QUEUE_NAME}")`);
  } else {
    logger.warn('[Bootstrap] Redis configured but queue init failed — using sync mode');
  }
} else {
  logger.info('[Bootstrap] Queue mode: sync (configure REDIS_URL to enable async processing)');
}

// ============================================================================
// Express
// ============================================================================

const app = express();

app.use(express.json({ limit: '10mb' }));

// Tenant resolution — resolve TenantContext em cada request (Parte 74)
app.use(tenantGuard);

// Health check — inclui status de providers e persistence
app.get('/health', (_req, res) => {
  const providers = checkProviderStatus();

  res.json({
    status: 'ok',
    engine: 'bookagent-intelligence-engine',
    version: '0.2.0',
    uptime: process.uptime(),
    persistence: {
      mode: persistenceMode,
      supabase: persistenceMode === 'supabase',
    },
    queue: {
      mode:    queueMode ? 'bullmq' : 'sync',
      enabled: queueMode,
    },
    providers: {
      ai: providers.ai,
      tts: providers.tts,
    },
    plans: {
      available: ['starter', 'pro', 'agency'],
      enforcement: 'active',
    },
  });
});

// API routes
const prefix = config.api.prefix;
app.use(`${prefix}/process`, processRoutes);
app.use(`${prefix}/jobs`, jobsRoutes);
app.use(`${prefix}/jobs`, approvalRoutes);
app.use(`${prefix}/leads`, leadsRoutes);
app.use(`${prefix}/ops`, opsRoutes);
app.use(`${prefix}/experiments`, experimentRoutes);
app.use(`${prefix}/billing`, billingRoutes);
app.use(`${prefix}/admin`, adminRoutes);
app.use(`${prefix}/analytics`, analyticsRoutes);
app.use(`${prefix}/insights`, insightsRoutes);
app.use(`${prefix}/templates`, templateRoutes);
app.use(`${prefix}/strategy`, strategyRoutes);
app.use(`${prefix}/campaigns`, campaignRoutes);
app.use(`${prefix}/campaigns`, scheduleRoutes);
app.use(`${prefix}/calendar`, calendarRouter);
app.use(`${prefix}/campaigns`, executionRoutes);
app.use(`${prefix}/governance`, governanceRoutes);
app.use(`${prefix}/campaigns`, optimizationRoutes);
app.use(`${prefix}/goals`, goalRoutes);
app.use(`${prefix}/memory`, memoryRoutes);
app.use(`${prefix}/recovery`, recoveryRoutes);
app.use(`${prefix}/knowledge-graph`, knowledgeGraphRoutes);
app.use(`${prefix}/simulation`, simulationRoutes);
app.use(`${prefix}/decisions`, decisionRoutes);
app.use(`${prefix}/copilot`, copilotRoutes);
app.use(`${prefix}/dashboard`, customerDashboardRoutes);

// Webhooks externos (Kiwify, Hotmart) — sem tenant guard
app.use('/webhooks', webhooksRoutes);

// Error handler (must be last)
app.use(errorHandler);

app.listen(config.port, () => {
  const status = checkProviderStatus();

  logger.info(`BookAgent Intelligence Engine running on port ${config.port}`);
  logger.info(`API prefix: ${prefix}`);
  logger.info(`Persistence: ${persistenceMode}`);
  logger.info(`AI Provider: ${status.ai.provider} (${status.ai.available ? 'configured' : 'no key — local mode'})`);
  logger.info(`TTS Provider: ${status.tts.provider} (${status.tts.available ? 'configured' : 'no key'})`);
  logger.info(`Endpoints:`);
  logger.info(`  POST ${prefix}/process`);
  logger.info(`  GET  ${prefix}/jobs`);
  logger.info(`  GET  ${prefix}/jobs/:jobId`);
  logger.info(`  GET  ${prefix}/jobs/:jobId/sources`);
  logger.info(`  GET  ${prefix}/jobs/:jobId/plans`);
  logger.info(`  GET  ${prefix}/jobs/:jobId/artifacts`);
  logger.info(`  GET  ${prefix}/jobs/:jobId/artifacts/:id`);
  logger.info(`  GET  ${prefix}/jobs/:jobId/artifacts/:id/download`);
  logger.info(`  GET  ${prefix}/jobs/:jobId/dashboard`);
  logger.info(`  POST ${prefix}/jobs/:jobId/approve`);
  logger.info(`  POST ${prefix}/jobs/:jobId/reject`);
  logger.info(`  POST ${prefix}/jobs/:jobId/comment`);
  logger.info(`  GET  ${prefix}/jobs/:jobId/comments`);
  logger.info(`  POST ${prefix}/jobs/:jobId/publish`);
  logger.info(`  GET  ${prefix}/jobs/:jobId/publications`);
  logger.info(`  POST ${prefix}/leads/register`);
  logger.info(`  GET  ${prefix}/leads/:phone`);
  logger.info(`  PATCH ${prefix}/leads/:phone/stage`);
  logger.info(`  POST ${prefix}/leads/:phone/event`);
  logger.info(`  POST ${prefix}/leads/:phone/demo`);
  logger.info(`  GET  ${prefix}/ops/dashboard`);
  logger.info(`  GET  ${prefix}/ops/queue`);
  logger.info(`  GET  ${prefix}/ops/costs`);
  logger.info(`  GET  ${prefix}/ops/growth`);
});

export default app;
