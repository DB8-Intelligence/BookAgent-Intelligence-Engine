/**
 * Routes: Experiments (A/B Testing)
 *
 * POST /experiments              → Criar experimento
 * GET  /experiments/:experimentId → Detalhe do experimento
 * POST /experiments/:experimentId/start    → Iniciar
 * POST /experiments/:experimentId/track    → Registrar evento
 * POST /experiments/:experimentId/complete → Concluir e selecionar vencedor
 *
 * Parte 72: A/B Testing Engine
 */

import { Router } from 'express';
import {
  createExperiment,
  getExperiment,
  startExperimentEndpoint,
  trackExperimentEvent,
  completeExperiment,
} from '../controllers/experimentController.js';

const router = Router();

router.post('/', createExperiment);
router.get('/:experimentId', getExperiment);
router.post('/:experimentId/start', startExperimentEndpoint);
router.post('/:experimentId/track', trackExperimentEvent);
router.post('/:experimentId/complete', completeExperiment);

export default router;
