/**
 * Routes: Simulation & What-If Engine
 *
 * Parte 93: Simulation & What-If Engine
 */

import { Router } from 'express';
import {
  runSim,
  getSimulation,
  listSims,
  compareScenarios,
  getRecommendations,
} from '../controllers/simulationController.js';

const router = Router();

router.post('/run',              runSim);
router.get('/recommendations',   getRecommendations);
router.post('/compare',          compareScenarios);
router.get('/:id',               getSimulation);
router.get('/',                  listSims);

export default router;
