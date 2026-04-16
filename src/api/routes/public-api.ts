/**
 * Routes: Public API for Partners
 *
 * Mounted at /api/public/v1 (separate from internal API)
 *
 * Parte 103: Escala + API
 */

import { Router } from 'express';
import {
  apiKeyAuth,
  publicProcess,
  publicGetJob,
  publicGetArtifacts,
  publicGetUsage,
} from '../controllers/publicApiController.js';

const router = Router();

// All routes require API key authentication
router.use(apiKeyAuth);

router.post('/process',            publicProcess);
router.get('/jobs/:id',            publicGetJob);
router.get('/artifacts/:jobId',    publicGetArtifacts);
router.get('/usage',               publicGetUsage);

export default router;
