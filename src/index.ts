/**
 * BookAgent Intelligence Engine — Entry Point (composition root)
 *
 * Inicializa o servidor Express, registra os módulos no pipeline e monta
 * as rotas de cada role (api / worker / renderer) conforme SERVICE_ROLE.
 *
 * Em modo SERVICE_ROLE=all (default), monta TUDO — comportamento idêntico
 * ao monolito anterior. Os modos individuais existem como preparação pro
 * split físico em Cloud Run (futuro Sprint 3).
 *
 * Endpoints:
 *   GET  /health                                    → Health check
 *   POST /api/v1/process                            → Iniciar processamento
 *   GET  /api/v1/jobs                               → Listar jobs
 *   ...                                              (ver services/api/composition.ts)
 *   POST /tasks/{pipeline,editorial,publication,cleanup}  (worker)
 *   POST /tasks/video                                     (renderer)
 *   POST /internal/execute-{pipeline,video-render}        (DEPRECATED aliases)
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { createRequire } from 'node:module';
import { resolve as resolvePath } from 'node:path';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { validateStartupSecrets } from './utils/secrets.js';

// --- Process-level error handling ---
process.on('uncaughtException', (err) => {
  logger.fatal(`[Process] Uncaught exception: ${err.message}`, err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error(`[Process] Unhandled rejection: ${reason}`);
});

import { Orchestrator } from './core/orchestrator.js';
import { SupabaseClient } from './persistence/supabase-client.js';
import { PersistentOrchestrator } from './persistence/persistent-orchestrator.js';
import { StorageManager } from './persistence/storage-manager.js';
import { checkProviderStatus } from './adapters/provider-factory.js';

// --- Controllers (dependency injection) ---
import { setOrchestrator as setProcessOrch, setProcessJobRepository } from './api/controllers/processController.js';
import { setOrchestrator as setJobsOrch, setJobRepository } from './api/controllers/jobsController.js';
import { setOrchestrator as setArtifactsOrch, setArtifactsJobRepository } from './api/controllers/artifactsController.js';
import { setSupabaseClientForApproval } from './api/controllers/approvalController.js';
import { setSupabaseClientForReview } from './api/controllers/reviewController.js';
import { setSupabaseClientForRevision } from './api/controllers/revisionController.js';
import { setSupabaseClientForBilling } from './api/controllers/billingController.js';
import { setSupabaseClientForAdmin } from './api/controllers/adminController.js';
import { setSupabaseClientForCustomerDashboard } from './api/controllers/customerDashboardController.js';
import { setSupabaseClientForAnalytics } from './api/controllers/analyticsController.js';
import { setSupabaseClientForInsights } from './api/controllers/insightsController.js';
import { setSupabaseClientForCoPilot } from './api/controllers/copilotController.js';
import { setSupabaseClientForTenants } from './api/controllers/tenantController.js';
import { setSupabaseClientForWhatsAppFunnel, setOrchestratorForWhatsAppFunnel } from './api/controllers/whatsappFunnelController.js';
import { setSupabaseClientForPublicApi } from './api/controllers/publicApiController.js';
import { setTenantGuardSupabaseClient } from './api/middleware/tenant-guard.js';
import { setAutoProvisionClient } from './api/middleware/auto-provision.js';
import { setVideoRenderSupabaseClient } from './api/controllers/videoRenderController.js';
import { setPlanGuardSupabaseClient } from './api/middleware/plan-guard.js';
import { setLeadsSupabaseClient } from './api/controllers/leadsController.js';
import { setOpsSupabaseClient } from './api/controllers/opsController.js';
import { setKiwifyWebhookClient } from './api/controllers/kiwifyWebhookController.js';
import { setSupabaseClientForBugs } from './api/routes/bugs.js';
import { setSupabaseClientForJobsDelete } from './api/routes/jobs.js';

// --- Queue ---
import { isQueueAvailable } from './queue/queue.js';
import { JobRepository } from './persistence/job-repository.js';

// --- Middleware ---
import { errorHandler } from './api/middleware/error-handler.js';

// --- Módulos do Pipeline (17 estágios) ---
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

// --- Service composition layer (Sprint 2) ---
import { mountApiRoutes, isApiRequest } from './services/api/index.js';
import { mountWorkerRoutes } from './services/worker/index.js';
import { mountRendererRoutes } from './services/renderer/index.js';
import { mountHealthRoute } from './services/shared/health.js';
import { buildTaskHandlerDeps, resolveServiceRole, shouldMount } from './services/shared/deps.js';

// ============================================================================
// Bootstrap
// ============================================================================

const role = resolveServiceRole();
logger.info(`[Bootstrap] SERVICE_ROLE=${role}`);

// Garantir diretórios de storage ao iniciar
const storageManager = new StorageManager();
storageManager.ensureDirectories().catch((err) => {
  logger.error(`[Bootstrap] CRITICAL: Failed to create storage directories: ${err}`);
  logger.error('[Bootstrap] Pipeline file operations will fail. Check disk permissions.');
});

// Criar orchestrator base
const baseOrchestrator = new Orchestrator();

// ─── Sprint 3.8 — Desacoplar antes de migrar ───────────────────────────────
// Firestore é canônico para profiles, jobs, artifacts, credits, bugs.
// Supabase volta como adapter LEGACY para 17 controllers do Cluster A
// (approval, billing, admin, customer-dashboard, analytics, insights,
// copilot, ops, leads, public-api, jobs-delete, video-render, review,
// revision, tenants, whatsapp-funnel, kiwify webhook idempotência).
//
// Cluster B (telemetria zero, Sprint 1) permanece desligado abaixo.
// Migração tabela-a-tabela em FASE 2 (ver docs/MASTER.md §7).
const LEGACY_SUPABASE_ENABLED = process.env.LEGACY_SUPABASE_ENABLED === 'true';

const supabaseClient: SupabaseClient | null = LEGACY_SUPABASE_ENABLED
  ? SupabaseClient.tryFromEnv()
  : null;

const orchestrator: Orchestrator | PersistentOrchestrator = supabaseClient
  ? new PersistentOrchestrator(baseOrchestrator, supabaseClient)
  : baseOrchestrator;

const persistenceMode: 'firestore-primary' | 'firestore-only' = supabaseClient
  ? 'firestore-primary'
  : 'firestore-only';

logger.info(
  `[Bootstrap] Persistence mode: ${persistenceMode} ` +
  `(legacy=${LEGACY_SUPABASE_ENABLED && !!supabaseClient})`,
);

// Registrar todos os 17 módulos no pipeline (ordem definida em pipeline.ts)
const pipelineModules = [
  new IngestionModule(),
  new BookCompatibilityAnalysisModule(),
  new BookReverseEngineeringModule(),
  new AssetExtractionModule(),
  new BrandingModule(),
  new CorrelationModule(),
  new SourceIntelligenceModule(),
  new NarrativeModule(),
  new OutputSelectionModule(),
  new MediaGenerationModule(),
  new BlogModule(),
  new LandingPageModule(),
  new PersonalizationModule(),
  new ContentScoringModule(),
  new RenderExportModule(),
  new DeliveryModule(),
  new PerformanceMonitoringModule(),
];

for (const mod of pipelineModules) {
  try {
    orchestrator.registerModule(mod);
  } catch (err) {
    logger.error(`[Bootstrap] Failed to register module ${mod.constructor.name}: ${err}`);
    process.exit(1);
  }
}
logger.info(`[Bootstrap] ${pipelineModules.length} pipeline modules registered`);

// Compartilhar orchestrator com todos os controllers
setProcessOrch(orchestrator);
setJobsOrch(orchestrator);
setArtifactsOrch(orchestrator);
setOrchestratorForWhatsAppFunnel(orchestrator);

// Injetar JobRepository no jobsController (fallback para leitura no Supabase)
if (supabaseClient) {
  const jobRepo = new JobRepository(supabaseClient);

  // ─── Load-bearing: módulos consumidos pela UI ou middleware crítico ─────
  setJobRepository(jobRepo);
  setProcessJobRepository(new JobRepository(supabaseClient));
  setArtifactsJobRepository(jobRepo);
  setAutoProvisionClient(supabaseClient);
  setTenantGuardSupabaseClient(supabaseClient);
  setPlanGuardSupabaseClient(supabaseClient);
  setSupabaseClientForApproval(supabaseClient);
  setSupabaseClientForReview(supabaseClient);
  setSupabaseClientForRevision(supabaseClient);
  setSupabaseClientForBilling(supabaseClient);
  setSupabaseClientForAdmin(supabaseClient);
  setSupabaseClientForCustomerDashboard(supabaseClient);
  setSupabaseClientForAnalytics(supabaseClient);
  setSupabaseClientForInsights(supabaseClient);
  setSupabaseClientForCoPilot(supabaseClient);
  setSupabaseClientForTenants(supabaseClient);
  setSupabaseClientForWhatsAppFunnel(supabaseClient);
  setSupabaseClientForPublicApi(supabaseClient);
  setSupabaseClientForBugs(supabaseClient);
  setSupabaseClientForJobsDelete(supabaseClient);
  setVideoRenderSupabaseClient(supabaseClient);
  setLeadsSupabaseClient(supabaseClient);
  setOpsSupabaseClient(supabaseClient);
  setKiwifyWebhookClient(supabaseClient);

  // ─── Sprint 1 (telemetria zero) — Cluster B desligado ───────────────────
  // Módulos cujos endpoints existem mas a UI (web/lib/bookagentApi.ts) não
  // consome. Sem injection, os métodos caem no guard `if (!supabase) return`
  // e degradam silenciosamente — zero writes/reads no Postgres legado.
  // Reativar é descomentar a linha. Ver MASTER §7 (Cluster B do ROI map).
  // setSupabaseClientForExperiments(supabaseClient);
  // setSupabaseClientForTemplates(supabaseClient);
  // setSupabaseClientForStrategy(supabaseClient);
  // setSupabaseClientForCampaigns(supabaseClient);
  // setSupabaseClientForScheduling(supabaseClient);
  // setSupabaseClientForExecution(supabaseClient);
  // setSupabaseClientForGovernance(supabaseClient);
  // setSupabaseClientForOptimization(supabaseClient);
  // setSupabaseClientForGoals(supabaseClient);
  // setSupabaseClientForMemory(supabaseClient);
  // setSupabaseClientForRecovery(supabaseClient);
  // setSupabaseClientForKnowledgeGraph(supabaseClient);
  // setSupabaseClientForSimulation(supabaseClient);
  // setSupabaseClientForDecisions(supabaseClient);
  // setSupabaseClientForExplainability(supabaseClient);
  // setSupabaseClientForMetaOptimization(supabaseClient);
  // setSupabaseClientForPartners(supabaseClient);
  // setSupabaseClientForAcquisition(supabaseClient);
  // setSupabaseClientForIntegrationHub(supabaseClient);
  // setSupabaseClientForDistribution(supabaseClient);
  // metrics.setSupabaseClient(supabaseClient);
}

// Task handler deps — usados por worker e renderer compositions.
const taskHandlerDeps = buildTaskHandlerDeps({
  orchestrator,
  storageManager,
  supabaseClient,
});

// Queue mode — Cloud Tasks async ou sync inline fallback
const queueMode = isQueueAvailable();
if (queueMode) {
  logger.info('[Bootstrap] Queue mode: Cloud Tasks async');
} else {
  logger.info(
    '[Bootstrap] Queue mode: sync inline ' +
    '(configure CLOUD_TASKS_QUEUE + CLOUD_TASKS_LOCATION + CLOUD_TASKS_SA_EMAIL + CLOUD_TASKS_TARGET_URL)',
  );
}

// ============================================================================
// Express
// ============================================================================

const app = express();

// CORS — allow frontend and configured origins
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') ?? [
    'https://bookreel.app',
    'https://www.bookreel.app',
    'https://bookagent.db8intelligence.com.br',
    'http://localhost:3001',
    'http://localhost:3000',
  ],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// ─── /health: sempre montado (todos os roles precisam pro Cloud Run probe) ──
mountHealthRoute(app, {
  persistenceMode,
  queueMode,
  pipelineModuleCount: pipelineModules.length,
  pipelineModuleStages: pipelineModules.map((m) => m.constructor.name),
  role,
});

// ─── Mounting condicional por role ──────────────────────────────────────────
const prefix = config.api.prefix;

if (shouldMount('api', role)) {
  mountApiRoutes(app, prefix);
}
if (shouldMount('worker', role)) {
  mountWorkerRoutes(app, taskHandlerDeps);
}
if (shouldMount('renderer', role)) {
  mountRendererRoutes(app, taskHandlerDeps);
}

// ============================================================================
// Next.js custom server — serve web/ (landing + dashboard) no mesmo processo
// ============================================================================
// Só faz sentido em api/all roles. Worker e renderer não servem frontend.

type NextRequestHandler = (req: Request, res: Response) => Promise<void>;
let nextHandler: NextRequestHandler | null = null;
let nextBootstrapError: Error | null = null;

async function bootstrapNext(): Promise<void> {
  const webDir = resolvePath(process.cwd(), 'web');
  try {
    const webRequire = createRequire(resolvePath(webDir, 'package.json'));
    const nextModule = webRequire('next');
    const nextFactory = (nextModule.default ?? nextModule) as (opts: {
      dev: boolean;
      dir: string;
    }) => { prepare: () => Promise<void>; getRequestHandler: () => NextRequestHandler };

    const nextApp = nextFactory({ dev: false, dir: webDir });
    await nextApp.prepare();
    nextHandler = nextApp.getRequestHandler();
    logger.info(`[Next] handler ready — serving web/ from ${webDir}`);
  } catch (err) {
    nextBootstrapError = err instanceof Error ? err : new Error(String(err));
    logger.error(`[Next] bootstrap failed: ${nextBootstrapError.message}`);
  }
}

if (shouldMount('api', role)) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isApiRequest(req)) return next();

    if (!nextHandler) {
      if (nextBootstrapError) {
        res.status(500).send(`Frontend bootstrap error: ${nextBootstrapError.message}`);
        return;
      }
      res.status(503).set('Retry-After', '2').send('Frontend starting up. Retry in a moment.');
      return;
    }

    nextHandler(req, res).catch((err: unknown) => {
      logger.error(`[Next] handler error for ${req.path}: ${err}`);
      if (!res.headersSent) res.status(500).send('Internal server error');
    });
  });
}

// Error handler (must be last — só pega erros de rotas Express/API)
app.use(errorHandler);

// IMPORTANT: app.listen opens the HTTP port IMMEDIATELY. Everything that
// could block (secrets validation, Redis/Supabase checks) happens in the
// callback AFTER the port is open, so Cloud Run startup probe succeeds
// within its timeout window.
app.listen(config.port, () => {
  // Port is open — Cloud Run startup probe will succeed now.
  logger.info(`BookAgent Intelligence Engine listening on port ${config.port} (role=${role})`);

  // Bootstrap Next.js async — só em api/all
  if (shouldMount('api', role)) {
    bootstrapNext().catch((err) => logger.error(`[Next] bootstrap rejected: ${err}`));
  }

  // Post-listen validations (non-blocking, logs only — NEVER throw here or
  // the Cloud Run container will crash after startup probe succeeded).
  validateStartupSecrets();

  const status = checkProviderStatus();

  logger.info(`API prefix: ${prefix}`);
  logger.info(`Persistence: ${persistenceMode}`);
  logger.info(`AI Provider: ${status.ai.provider} (${status.ai.available ? 'configured' : 'no key — local mode'})`);
  logger.info(`TTS Provider: ${status.tts.provider} (${status.tts.available ? 'configured' : 'no key'})`);
});

export default app;
