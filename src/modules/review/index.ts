/**
 * Review Module — Review/Comment Engine
 *
 * Expõe a API pública do módulo de revisão e comentários.
 *
 * Parte 68: Review/Comment Engine
 */

export {
  createReview,
  listReviews,
  getReviewById,
  getReviewSummary,
  resolveReview,
  supersedeReviews,
} from './review-service.js';
