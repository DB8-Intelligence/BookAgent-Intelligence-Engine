/**
 * Routes: Jobs
 *
 * Endpoints para consulta de jobs, resultados, sources, planos e artifacts.
 *
 * GET    /jobs                               → Lista todos os jobs
 * GET    /jobs/:jobId                        → Detalhe do job com resumo
 * DELETE /jobs/:jobId                        → Remove job + meta + artifacts (cascade)
 * GET    /jobs/:jobId/sources                → Lista sources geradas
 * GET    /jobs/:jobId/plans                  → Lista planos (media, blog, LP)
 * GET    /jobs/:jobId/artifacts              → Lista artifacts exportados
 * GET    /jobs/:jobId/artifacts/:artifactId  → Detalhe de um artifact
 * GET    /jobs/:jobId/artifacts/:artifactId/download → Download raw
 */

import { Router, type Request, type Response } from 'express';
import { listJobs, getJobDetail, getJobSources, getJobPlans } from '../controllers/jobsController.js';
import { listArtifacts, getArtifactDetail, downloadArtifact } from '../controllers/artifactsController.js';
import { SupabaseClient } from '../../persistence/supabase-client.js';
import { logger } from '../../utils/logger.js';

const router = Router();

// Jobs
router.get('/', listJobs);
router.get('/:jobId', getJobDetail);

// DELETE /jobs/:jobId — delete job + cascading rows
let supabaseForJobs: SupabaseClient | null = null;
export function setSupabaseClientForJobsDelete(client: SupabaseClient): void {
  supabaseForJobs = client;
}

router.delete('/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const userId = req.authUser?.id ?? req.tenantContext?.userId ?? (req.headers['x-user-id'] as string | undefined);

  if (!userId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    });
    return;
  }

  if (!supabaseForJobs) {
    res.status(503).json({
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Supabase not configured' },
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    });
    return;
  }

  try {
    // Verify ownership via job_meta
    const meta = await supabaseForJobs.select<{ user_id: string | null; tenant_id: string | null }>(
      'bookagent_job_meta',
      {
        filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
        select: 'user_id,tenant_id',
        limit: 1,
      },
    );
    if (meta.length > 0 && meta[0].user_id && meta[0].user_id !== userId) {
      // Only owner can delete (admin bypass handled elsewhere)
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not own this job' },
        meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
      });
      return;
    }

    // Delete in cascade order: artifacts → publications → meta → usage → job
    const filter = { column: 'job_id', operator: 'eq' as const, value: jobId };
    await supabaseForJobs.delete('bookagent_job_artifacts', filter).catch(() => {});
    await supabaseForJobs.delete('bookagent_publications', filter).catch(() => {});
    await supabaseForJobs.delete('bookagent_usage', filter).catch(() => {});
    await supabaseForJobs.delete('bookagent_job_meta', filter).catch(() => {});
    await supabaseForJobs.delete('bookagent_jobs', { column: 'id', operator: 'eq', value: jobId }).catch(() => {});

    logger.info(`[Jobs] Deleted job ${jobId} (user=${userId})`);

    res.status(200).json({
      success: true,
      data: { jobId, deleted: true },
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    });
  } catch (err) {
    logger.error(`[Jobs] Failed to delete job ${jobId}: ${err}`);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete job' },
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    });
  }
});

// Sources & Plans
router.get('/:jobId/sources', getJobSources);
router.get('/:jobId/plans', getJobPlans);

// Artifacts
router.get('/:jobId/artifacts', listArtifacts);
router.get('/:jobId/artifacts/:artifactId', getArtifactDetail);
router.get('/:jobId/artifacts/:artifactId/download', downloadArtifact);

export default router;
