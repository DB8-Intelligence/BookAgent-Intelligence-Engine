/**
 * Routes: Jobs
 *
 * Endpoints para consulta de jobs, resultados, sources, planos e artifacts.
 *
 * GET  /jobs                               → Lista todos os jobs
 * GET  /jobs/:jobId                        → Detalhe do job com resumo
 * GET  /jobs/:jobId/sources                → Lista sources geradas
 * GET  /jobs/:jobId/plans                  → Lista planos (media, blog, LP)
 * GET  /jobs/:jobId/artifacts              → Lista artifacts exportados
 * GET  /jobs/:jobId/artifacts/:artifactId  → Detalhe de um artifact
 * GET  /jobs/:jobId/artifacts/:artifactId/download → Download raw
 */

import { Router } from 'express';
import { listJobs, getJobDetail, getJobSources, getJobPlans } from '../controllers/jobsController.js';
import { listArtifacts, getArtifactDetail, downloadArtifact } from '../controllers/artifactsController.js';

const router = Router();

// Jobs
router.get('/', listJobs);
router.get('/:jobId', getJobDetail);

// Sources & Plans
router.get('/:jobId/sources', getJobSources);
router.get('/:jobId/plans', getJobPlans);

// Artifacts
router.get('/:jobId/artifacts', listArtifacts);
router.get('/:jobId/artifacts/:artifactId', getArtifactDetail);
router.get('/:jobId/artifacts/:artifactId/download', downloadArtifact);

export default router;
