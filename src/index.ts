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
 *   GET  /api/v1/ops/queue                          → Saúde da fila (Cloud Tasks)
 *   GET  /api/v1/ops/costs                          → Análise de custos e margem
 *   GET  /api/v1/ops/growth                         → Fase de crescimento e recomendações
 */

import express, { type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import cors from 'cors';
import { createRequire } from 'node:module';
import { resolve as resolvePath } from 'node:path';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { validateStartupSecrets, auditSecrets } from './utils/secrets.js';

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
import { setSupabaseClientForExplainability } from './api/controllers/explainabilityController.js';
import { setSupabaseClientForMetaOptimization } from './api/controllers/metaOptimizationController.js';
import { setSupabaseClientForTenants } from './api/controllers/tenantController.js';
import { setSupabaseClientForWhatsAppFunnel, setOrchestratorForWhatsAppFunnel } from './api/controllers/whatsappFunnelController.js';
import { setSupabaseClientForPublicApi } from './api/controllers/publicApiController.js';
import { setSupabaseClientForPartners } from './api/controllers/partnerController.js';
import { setSupabaseClientForAcquisition } from './api/controllers/acquisitionController.js';
import { setSupabaseClientForIntegrationHub } from './api/controllers/integrationHubController.js';
import { setSupabaseClientForDistribution } from './api/controllers/distributionController.js';
import { setTenantGuardSupabaseClient, tenantGuard } from './api/middleware/tenant-guard.js';
import { firebaseAuthMiddleware } from './api/middleware/firebase-auth.js';
import { autoProvisionMiddleware, setAutoProvisionClient } from './api/middleware/auto-provision.js';
import { setVideoRenderSupabaseClient } from './api/controllers/videoRenderController.js';
import { setPlanGuardSupabaseClient } from './api/middleware/plan-guard.js';
import { setLeadsSupabaseClient } from './api/controllers/leadsController.js';
import { setOpsSupabaseClient } from './api/controllers/opsController.js';
import { setKiwifyWebhookClient } from './api/controllers/kiwifyWebhookController.js';
import { metrics } from './observability/metrics.js';

// --- Queue ---
import { isQueueAvailable } from './queue/queue.js';
import { isCloudTasksConfigured } from './queue/cloud-tasks.js';
import { JobRepository } from './persistence/job-repository.js';
import { ArtifactRepository } from './persistence/artifact-repository.js';

// --- Routes ---
import processRoutes from './api/routes/process.js';
import jobsRoutes from './api/routes/jobs.js';
import uploadsRoutes from './api/routes/uploads.js';
import billingFirestoreRoutes from './api/routes/billing-firestore.js';
import tenantsFirestoreRoutes from './api/routes/tenants-firestore.js';
import pipelineEventsRoutes from './api/routes/pipeline-events.js';
import approvalRoutes from './api/routes/approval.js';
import reviewRoutes from './api/routes/reviews.js';
import revisionRoutes from './api/routes/revisions.js';
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
import explainabilityRoutes from './api/routes/explainability.js';
import metaOptimizationRoutes from './api/routes/meta-optimization.js';
import tenantRoutes, { planRouter as planRoutes } from './api/routes/tenants.js';
import funnelRoutes from './api/routes/funnel.js';
import publicApiRoutes from './api/routes/public-api.js';
import partnerRoutes from './api/routes/partners.js';
import acquisitionRoutes from './api/routes/acquisition.js';
import integrationHubRoutes from './api/routes/integration-hub.js';
import distributionRoutes from './api/routes/distribution.js';
import customerDashboardRoutes from './api/routes/customer-dashboard.js';
import videoRoutes from './api/routes/video.js';
import bugsRoutes, { setSupabaseClientForBugs } from './api/routes/bugs.js';
import internalRoutes, { setInternalRoutesDeps } from './api/routes/internal.js';
import tasksRoutes, { setTasksRoutesDeps } from './api/routes/tasks.js';
import { setSupabaseClientForJobsDelete } from './api/routes/jobs.js';

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
  logger.error(`[Bootstrap] CRITICAL: Failed to create storage directories: ${err}`);
  logger.error('[Bootstrap] Pipeline file operations will fail. Check disk permissions.');
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

// Tasks routes (canonical Cloud Tasks endpoints) e Internal (alias deprecated)
// — ambos compartilham as mesmas deps porque ambos delegam aos task-handlers.
const taskHandlerDeps = {
  orchestrator,
  jobRepo: supabaseClient ? new JobRepository(supabaseClient) : null,
  artifactRepo: supabaseClient ? new ArtifactRepository(supabaseClient) : null,
  storageManager,
  supabaseClient,
};
setTasksRoutesDeps(taskHandlerDeps);
setInternalRoutesDeps(taskHandlerDeps);

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

// Paths que NÃO são frontend Next — qualquer coisa que não comece com esses
// prefixos é tratada como asset/rota do Next e pula auth middlewares.
const API_PATHS = ['/api', '/internal', '/tasks', '/webhooks', '/generate-video', '/health'];
const isApiRequest = (req: Request): boolean =>
  API_PATHS.some((p) => req.path === p || req.path.startsWith(`${p}/`));

const apiOnly = (mw: RequestHandler): RequestHandler =>
  (req, res, next) => (isApiRequest(req) ? mw(req, res, next) : next());

// Auth chain: só roda em requests de API, não em assets do Next
app.use(apiOnly(firebaseAuthMiddleware));
app.use(apiOnly(autoProvisionMiddleware));
app.use(apiOnly(tenantGuard));

// Health check — inclui status de providers e persistence
app.get('/health', (_req, res) => {
  const providers = checkProviderStatus();

  res.json({
    status: 'ok',
    engine: 'bookagent-intelligence-engine',
    version: '1.0.0',
    uptime: process.uptime(),
    persistence: {
      // Firestore é o primário pras 3 coleções migradas (profiles, jobs,
      // artifacts). Supabase permanece pros módulos não-migrados
      // (billing, analytics, admin, bugs, leads, campaigns, etc.).
      primary: 'firestore',
      firestore: {
        enabled: !!(process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID),
        projectId: process.env.GOOGLE_CLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? null,
      },
      supabase: {
        mode: persistenceMode,
        enabled: persistenceMode === 'supabase',
        scope: 'legacy-modules-only',
      },
    },
    queue: {
      mode:     queueMode ? 'cloud-tasks-async' : 'sync-inline',
      enabled:  queueMode,
      provider: queueMode ? 'google-cloud-tasks' : null,
    },
    providers: {
      ai: providers.ai,
      tts: providers.tts,
    },
    socialPublish: {
      metaCredentials: !!process.env.META_ACCESS_TOKEN,
      instagram: !!(process.env.META_ACCESS_TOKEN && process.env.META_INSTAGRAM_ACCOUNT_ID),
      facebook: !!(process.env.META_ACCESS_TOKEN && process.env.META_FACEBOOK_PAGE_ID),
    },
    // Secrets audit — só presença/tamanho, nunca o valor
    secrets: auditSecrets(),
    plans: {
      available: ['starter', 'pro', 'agency'],
      enforcement: 'active',
    },
    pipeline: {
      modules: pipelineModules.length,
      stages: pipelineModules.map((m) => m.constructor.name),
    },
    routes: {
      total: 30,
      prefixes: [
        'process', 'jobs', 'leads', 'ops', 'experiments', 'billing',
        'admin', 'analytics', 'insights', 'templates', 'strategy',
        'campaigns', 'calendar', 'governance', 'goals', 'memory',
        'recovery', 'knowledge-graph', 'simulation', 'decisions',
        'copilot', 'explainability', 'optimization/meta', 'dashboard',
      ],
    },
  });
});

// API routes
const prefix = config.api.prefix;
app.use(`${prefix}/process`, processRoutes);
app.use(`${prefix}/uploads`, uploadsRoutes);
app.use(`${prefix}/billing-fs`, billingFirestoreRoutes);
app.use(`${prefix}/tenants-fs`, tenantsFirestoreRoutes);
app.use(`${prefix}/jobs`, jobsRoutes);
// SSE stream de eventos do pipeline — montado em /jobs/:jobId/events
app.use(`${prefix}/jobs`, pipelineEventsRoutes);
app.use(`${prefix}/jobs`, approvalRoutes);
app.use(`${prefix}/jobs`, reviewRoutes);
app.use(`${prefix}/jobs`, revisionRoutes);
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
app.use(`${prefix}/explainability`, explainabilityRoutes);
app.use(`${prefix}/optimization/meta`, metaOptimizationRoutes);
app.use(`${prefix}/tenants`, tenantRoutes);
app.use(`${prefix}/plans`, planRoutes);
app.use(`${prefix}/funnel`, funnelRoutes);
app.use(`${prefix}/dashboard`, customerDashboardRoutes);

app.use(`${prefix}/partners`, partnerRoutes);
app.use(`${prefix}/acquisition`, acquisitionRoutes);
app.use(`${prefix}/integrations`, integrationHubRoutes);
app.use(`${prefix}/distribution`, distributionRoutes);
app.use(`${prefix}/bugs`, bugsRoutes);

// Tasks routes — canonical Cloud Tasks endpoints (OIDC authenticated).
// Fora do prefix /api/v1 porque não são endpoints de usuário.
app.use('/tasks', tasksRoutes);

// Internal routes — DEPRECATED alias mantido por 1 sprint pra absorver tasks
// já enfileiradas pros caminhos antigos (/internal/execute-pipeline, etc.).
// Remover quando a queue do Cloud Tasks confirmar que está vazia.
app.use('/internal', internalRoutes);

// Webhooks externos (Kiwify, Hotmart) — sem tenant guard
app.use('/webhooks', webhooksRoutes);

// Video Generation
app.use('/generate-video', videoRoutes);

// Public API (separate prefix, API key auth)
app.use('/api/public/v1', publicApiRoutes);

// ============================================================================
// Next.js custom server — serve web/ (landing + dashboard) no mesmo processo
// ============================================================================
// Tudo que não é API/webhook/internal cai aqui. Next.js faz SSR + static +
// App Router + middleware (web/middleware.ts — auth Supabase das rotas
// protegidas). Carregado async em bootstrap: porta abre rápido pro Cloud Run
// e o handler fica pronto em ~1-3s.

type NextRequestHandler = (req: Request, res: Response) => Promise<void>;
let nextHandler: NextRequestHandler | null = null;
let nextBootstrapError: Error | null = null;

async function bootstrapNext(): Promise<void> {
  const webDir = resolvePath(process.cwd(), 'web');
  try {
    // Resolve `next` a partir de web/node_modules — a versão que o app
    // foi construído usa, sem duplicar no root package.json.
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

app.use((req: Request, res: Response, next: NextFunction) => {
  // Requests de API seguem pra errorHandler / 404 padrão do Express.
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

// Error handler (must be last — só pega erros de rotas Express/API)
app.use(errorHandler);

// IMPORTANT: app.listen opens the HTTP port IMMEDIATELY. Everything that
// could block (secrets validation, Redis/Supabase checks) happens in the
// callback AFTER the port is open, so Cloud Run startup probe succeeds
// within its timeout window.
app.listen(config.port, () => {
  // Port is open — Cloud Run startup probe will succeed now.
  logger.info(`BookAgent Intelligence Engine listening on port ${config.port}`);

  // Bootstrap Next.js async — frontend responde 503 até ficar pronto
  // (geralmente 1-3s). Não bloqueia o health check nem API requests.
  bootstrapNext().catch((err) => logger.error(`[Next] bootstrap rejected: ${err}`));

  // Post-listen validations (non-blocking, logs only — NEVER throw here or
  // the Cloud Run container will crash after startup probe succeeded).
  validateStartupSecrets();

  const status = checkProviderStatus();

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
