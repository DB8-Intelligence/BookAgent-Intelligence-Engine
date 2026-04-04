/**
 * Routes: Process
 *
 * POST /process — Iniciar processamento de material
 */

import { Router } from 'express';
import { createProcess } from '../controllers/processController.js';

const router = Router();

router.post('/', createProcess);

export default router;
