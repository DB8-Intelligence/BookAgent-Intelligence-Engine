/**
 * BookAgent Intelligence Engine — Entry Point
 *
 * Inicializa o servidor Express, registra os módulos no pipeline
 * e configura as rotas da API.
 *
 * Endpoints:
 *   GET  /health                                    → Health check
 *   POST /api/v1/process                            → Iniciar processamento
 *   GET  /api/v1/jobs                               → Listar jobs
 *   GET  /api/v1/jobs/:jobId                        → Detalhe do job
 *   GET  /api/v1/jobs/:jobId/sources                → Sources do job
 *   GET  /api/v1/jobs/:jobId/plans                  → Planos do job
 *   GET  /api/v1/jobs/:jobId/artifacts              → Artifacts do job
 *   GET  /api/v1/jobs/:jobId/artifacts/:id          → Detalhe do artifact
 *   GET  /api/v1/jobs/:jobId/artifacts/:id/download → Download do artifact
 */

import express from 'express';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { Orchestrator } from './core/orchestrator.js';

// --- Controllers (dependency injection) ---
import { setOrchestrator as setProcessOrch } from './api/controllers/processController.js';
import { setOrchestrator as setJobsOrch } from './api/controllers/jobsController.js';
import { setOrchestrator as setArtifactsOrch } from './api/controllers/artifactsController.js';

// --- Routes ---
import processRoutes from './api/routes/process.js';
import jobsRoutes from './api/routes/jobs.js';

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
import { DeliveryModule } from './modules/delivery/index.js';

// --- Bootstrap ---
const orchestrator = new Orchestrator();

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
orchestrator.registerModule(new RenderExportModule());
orchestrator.registerModule(new DeliveryModule());

// Compartilhar orchestrator com todos os controllers
setProcessOrch(orchestrator);
setJobsOrch(orchestrator);
setArtifactsOrch(orchestrator);

// --- Express ---
const app = express();

app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    engine: 'bookagent-intelligence-engine',
    version: '0.1.0',
    uptime: process.uptime(),
  });
});

// API routes
const prefix = config.api.prefix;
app.use(`${prefix}/process`, processRoutes);
app.use(`${prefix}/jobs`, jobsRoutes);

// Error handler (must be last)
app.use(errorHandler);

app.listen(config.port, () => {
  logger.info(`BookAgent Intelligence Engine running on port ${config.port}`);
  logger.info(`API prefix: ${prefix}`);
  logger.info(`Endpoints:`);
  logger.info(`  POST ${prefix}/process`);
  logger.info(`  GET  ${prefix}/jobs`);
  logger.info(`  GET  ${prefix}/jobs/:jobId`);
  logger.info(`  GET  ${prefix}/jobs/:jobId/sources`);
  logger.info(`  GET  ${prefix}/jobs/:jobId/plans`);
  logger.info(`  GET  ${prefix}/jobs/:jobId/artifacts`);
  logger.info(`  GET  ${prefix}/jobs/:jobId/artifacts/:id`);
  logger.info(`  GET  ${prefix}/jobs/:jobId/artifacts/:id/download`);
});

export default app;
