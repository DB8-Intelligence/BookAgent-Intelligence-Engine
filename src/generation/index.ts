/**
 * Text Generation Layer — Public API
 *
 * Camada de geração de texto final que transforma planos estruturais
 * (BlogPlan, LandingPagePlan, MediaPlan) em conteúdo editorial pronto
 * para publicação, narração ou exibição.
 *
 * Modos:
 * - 'local': geração inteligente sem dependência de API externa
 * - 'ai': geração via IAIAdapter (OpenAI, Gemini, etc.)
 */

export { generateBlogText } from './blog-text-generator.js';
export { generateLandingPageCopy } from './lp-text-generator.js';
export { generateMediaScript } from './media-script-generator.js';

export type {
  GeneratedBlogArticle,
  GeneratedBlogSection,
  GeneratedLandingPageCopy,
  GeneratedLPSection,
  GeneratedMediaScript,
  GeneratedSceneScript,
  TextGenerationOptions,
} from './types.js';
