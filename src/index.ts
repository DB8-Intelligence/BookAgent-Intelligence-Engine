/**
 * BookAgent Intelligence Engine — Entry Point
 *
 * Inicializa o servidor Express e registra os módulos no pipeline.
 */

import express from 'express';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import processRoutes from './api/routes/process.js';

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
