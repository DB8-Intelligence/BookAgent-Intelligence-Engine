/**
 * Routes: Review/Comment Engine
 *
 * Montado em /api/v1/jobs (sub-rotas de :jobId)
 *
 * Parte 68 / Parte 100 consolidação
 */

import { Router } from 'express';
import {
  createJobReview,
  getJobReviews,
  getJobReviewSummary,
} from '../controllers/reviewController.js';

const router = Router();

router.post('/:jobId/review',           createJobReview);
router.get('/:jobId/reviews',           getJobReviews);
router.get('/:jobId/reviews/summary',   getJobReviewSummary);

export default router;
