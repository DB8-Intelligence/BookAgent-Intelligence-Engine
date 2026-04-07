/**
 * Routes: Approval, Comments, Publications, Reviews & Revisions
 *
 * Endpoints de aprovação e interação do dashboard com os jobs.
 *
 * POST /jobs/:jobId/approve           → Aprovar (intermediário ou final)
 * POST /jobs/:jobId/reject            → Reprovar (com comentário obrigatório)
 * POST /jobs/:jobId/comment           → Adicionar comentário livre
 * GET  /jobs/:jobId/comments          → Listar histórico de comentários
 * POST /jobs/:jobId/publish           → Solicitar publicação via n8n (plano Pro)
 * POST /jobs/:jobId/social-publish    → Publicação real nas redes sociais (Parte 51)
 * GET  /jobs/:jobId/publications      → Status das publicações por plataforma
 * GET  /jobs/:jobId/dashboard         → Visão completa para o dashboard
 * POST /jobs/:jobId/review            → Criar review (Parte 68)
 * GET  /jobs/:jobId/reviews           → Listar reviews (Parte 68)
 * GET  /jobs/:jobId/reviews/summary   → Resumo de reviews (Parte 68)
 * POST /jobs/:jobId/revision          → Criar e executar revisão (Parte 69)
 * GET  /jobs/:jobId/revisions         → Listar revisões (Parte 69)
 * GET  /jobs/:jobId/revisions/:revisionId → Detalhe de revisão (Parte 69)
 * GET  /jobs/:jobId/experiments → Listar experimentos do job (Parte 72)
 */

import { Router } from 'express';
import {
  approveJob,
  rejectJob,
  commentJob,
  getJobComments,
  publishJob,
  getJobPublications,
  getJobDashboardView,
  socialPublishJob,
} from '../controllers/approvalController.js';
import {
  renderVideo,
  getVideoStatus,
} from '../controllers/videoRenderController.js';
import {
  createJobReview,
  getJobReviews,
  getJobReviewSummary,
} from '../controllers/reviewController.js';
import {
  createJobRevision,
  getJobRevisions,
  getJobRevisionById,
} from '../controllers/revisionController.js';
import {
  getJobExperiments,
} from '../controllers/experimentController.js';

const router = Router({ mergeParams: true });

// Aprovação e decisão
router.post('/:jobId/approve',  approveJob);
router.post('/:jobId/reject',   rejectJob);

// Comentários
router.post('/:jobId/comment',  commentJob);
router.get('/:jobId/comments',  getJobComments);

// Publicação via n8n (plano Pro, delega ao Fluxo 4)
router.post('/:jobId/publish',         publishJob);
// Publicação real via Meta Graph API (Parte 51)
router.post('/:jobId/social-publish',  socialPublishJob);

router.get('/:jobId/publications',   getJobPublications);

// Vídeo — renderização assíncrona pós-aprovação (Parte 59.1)
router.post('/:jobId/render-video',  renderVideo);
router.get('/:jobId/video-status',   getVideoStatus);

// Visão dashboard completa
router.get('/:jobId/dashboard',  getJobDashboardView);

// Reviews — Parte 68
router.post('/:jobId/review',           createJobReview);
router.get('/:jobId/reviews',           getJobReviews);
router.get('/:jobId/reviews/summary',   getJobReviewSummary);

// Revisions — Parte 69
router.post('/:jobId/revision',                    createJobRevision);
router.get('/:jobId/revisions',                    getJobRevisions);
router.get('/:jobId/revisions/:revisionId',        getJobRevisionById);

// Experiments — Parte 72
router.get('/:jobId/experiments',  getJobExperiments);

export default router;
