/**
 * Routes: Revision Loop Engine
 *
 * Montado em /api/v1/jobs (sub-rotas de :jobId)
 *
 * Parte 69 / Parte 100 consolidação
 */

import { Router } from 'express';
import {
  createJobRevision,
  getJobRevisions,
  getJobRevisionById,
} from '../controllers/revisionController.js';

const router = Router();

router.post('/:jobId/revision',              createJobRevision);
router.get('/:jobId/revisions',              getJobRevisions);
router.get('/:jobId/revisions/:revisionId',  getJobRevisionById);

export default router;
