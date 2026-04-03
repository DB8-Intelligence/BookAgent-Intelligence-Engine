/**
 * Routes: Process
 *
 * Endpoints para processamento de materiais:
 *
 * POST /process       → Iniciar processamento
 * GET  /process/:id   → Consultar status do job
 */

import { Router } from 'express';
import { createProcess, getProcessStatus } from '../controllers/processController.js';

const router = Router();

router.post('/', createProcess);
router.get('/:jobId', getProcessStatus);

export default router;
