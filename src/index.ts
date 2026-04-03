/**
 * BookAgent Intelligence Engine — Entry Point
 *
 * Inicializa o servidor Express, registra os módulos no pipeline
 * e configura as rotas da API.
 */

import express from 'express';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { Orchestrator } from './core/orchestrator.js';
import { setOrchestrator } from './api/controllers/processController.js';
import processRoutes from './api/routes/process.js';

// --- Módulos ---
import { IngestionModule } from './modules/ingestion/index.js';
import { AssetExtractionModule } from './modules/asset-extraction/index.js';
import { CorrelationModule } from './modules/correlation/index.js';
import { BrandingModule } from './modules/branding/index.js';
import { SourceIntelligenceModule } from './modules/source-intelligence/index.js';
import { NarrativeModule } from './modules/narrative/index.js';
import { OutputSelectionModule } from './modules/output-selection/index.js';
import { MediaGenerationModule } from './modules/media/index.js';
import { PersonalizationModule } from './modules/personalization/index.js';

// --- Bootstrap ---
const orchestrator = new Orchestrator();

// Registrar todos os módulos no pipeline
orchestrator.registerModule(new IngestionModule());
orchestrator.registerModule(new AssetExtractionModule());
orchestrator.registerModule(new CorrelationModule());
orchestrator.registerModule(new BrandingModule());
orchestrator.registerModule(new SourceIntelligenceModule());
orchestrator.registerModule(new NarrativeModule());
orchestrator.registerModule(new OutputSelectionModule());
orchestrator.registerModule(new MediaGenerationModule());
orchestrator.registerModule(new PersonalizationModule());

// Compartilhar orchestrator com os controllers
setOrchestrator(orchestrator);

// --- Express ---
const app = express();

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', engine: 'bookagent-intelligence-engine', version: '0.1.0' });
});

// API routes
app.use(`${config.api.prefix}/process`, processRoutes);

app.listen(config.port, () => {
  logger.info(`BookAgent Intelligence Engine running on port ${config.port}`);
});

export default app;
