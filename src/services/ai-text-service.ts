/**
 * Service: AITextService
 *
 * Orquestra geração de texto com IA para os três tipos de conteúdo
 * do pipeline: blog, landing page e roteiros de mídia.
 *
 * Aceita dois modos de uso:
 *
 * 1. Single adapter (backward compat):
 *      new AITextService(tryCreateAIAdapter())
 *    → Usa o mesmo provider para todas as tarefas.
 *
 * 2. ProviderRouter (multi-provider):
 *      new AITextService(createProviderRouter())
 *    → Usa o provider mais adequado por tipo de tarefa:
 *        blog / landing → OpenAI  (copy de conversão)
 *        media script   → Anthropic (raciocínio narrativo)
 *
 * Estratégia de fallback (AI_GENERATION_MODE):
 *   auto  → usa IA se adapter disponível; fallback local se não
 *   ai    → exige IA (falha se adapter não disponível)
 *   local → sempre usa geração local (ignora adapters)
 */

import type { IAIAdapter } from '../domain/interfaces/ai-adapter.js';
import type { BlogPlan } from '../domain/entities/blog-plan.js';
import type { LandingPagePlan } from '../domain/entities/landing-page-plan.js';
import type { MediaPlan } from '../domain/entities/media-plan.js';
import type { ToneOfVoice } from '../domain/entities/narrative.js';
import type {
  GeneratedBlogArticle,
  GeneratedLandingPageCopy,
  GeneratedMediaScript,
  TextGenerationOptions,
} from '../generation/types.js';
import { generateBlogText } from '../generation/blog-text-generator.js';
import { generateLandingPageCopy } from '../generation/lp-text-generator.js';
import { generateMediaScript } from '../generation/media-script-generator.js';
import { ProviderRouter } from '../adapters/provider-router.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AIGenerationMode = 'auto' | 'ai' | 'local';

export interface AITextServiceOptions {
  projectName?: string;
  region?: string;
  tone?: ToneOfVoice;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AITextService {
  private blogAdapter:    IAIAdapter | null;
  private landingAdapter: IAIAdapter | null;
  private mediaAdapter:   IAIAdapter | null;
  private mode: AIGenerationMode;

  /**
   * @param adapters - Um ProviderRouter (multi-provider) ou um IAIAdapter único
   *                   (backward compat — mesmo adapter para todas as tarefas).
   *                   Null → geração local para todas as tarefas.
   */
  constructor(adapters: ProviderRouter | IAIAdapter | null, mode?: AIGenerationMode) {
    if (adapters instanceof ProviderRouter) {
      this.blogAdapter    = adapters.getAdapter('blog');
      this.landingAdapter = adapters.getAdapter('landing_page');
      this.mediaAdapter   = adapters.getAdapter('media_script');
    } else {
      // Single adapter — backward compat
      this.blogAdapter    = adapters;
      this.landingAdapter = adapters;
      this.mediaAdapter   = adapters;
    }

    this.mode = mode
      ?? (process.env.AI_GENERATION_MODE as AIGenerationMode | undefined)
      ?? 'auto';
  }

  /**
   * Indica se pelo menos uma tarefa usará IA.
   * Em modo=local, sempre retorna false.
   * Em modo=ai, lança se nenhum adapter disponível.
   */
  willUseAI(): boolean {
    if (this.mode === 'local') return false;

    const any = this.blogAdapter !== null
      || this.landingAdapter !== null
      || this.mediaAdapter !== null;

    if (this.mode === 'ai' && !any) {
      throw new Error('[AITextService] mode=ai but no AI adapter available. Check API keys.');
    }

    return any;
  }

  /**
   * Gera artigo de blog com texto corrido (usa blogAdapter).
   * Fallback para geração local se IA não disponível ou falhar.
   */
  async generateBlog(
    plan: BlogPlan,
    options: AITextServiceOptions = {},
  ): Promise<GeneratedBlogArticle> {
    const adapter = this.blogAdapter;
    const useAI = this.shouldUseAI(adapter);
    const genOptions: TextGenerationOptions = {
      mode: useAI ? 'ai' : 'local',
      tone: options.tone ?? plan.tone,
      projectName: options.projectName,
      region: options.region,
    };

    if (useAI && adapter) {
      logger.info(`[AITextService] Generating blog with ${adapter.provider}`);
      try {
        return await generateBlogText(plan, genOptions, adapter);
      } catch (err) {
        if (this.mode === 'ai') throw err;
        logger.warn(`[AITextService] Blog AI failed, using local: ${err}`);
        return generateBlogText(plan, { ...genOptions, mode: 'local' });
      }
    }

    logger.info('[AITextService] Generating blog with local engine');
    return generateBlogText(plan, genOptions);
  }

  /**
   * Gera copy de landing page por seção (usa landingAdapter).
   * Fallback para geração local se IA não disponível ou falhar.
   */
  async generateLandingPage(
    plan: LandingPagePlan,
    options: AITextServiceOptions = {},
  ): Promise<GeneratedLandingPageCopy> {
    const adapter = this.landingAdapter;
    const useAI = this.shouldUseAI(adapter);
    const genOptions: TextGenerationOptions = {
      mode: useAI ? 'ai' : 'local',
      tone: options.tone ?? plan.tone,
      projectName: options.projectName ?? plan.title,
      region: options.region,
    };

    if (useAI && adapter) {
      logger.info(`[AITextService] Generating landing page with ${adapter.provider}`);
      try {
        return await generateLandingPageCopy(plan, genOptions, adapter);
      } catch (err) {
        if (this.mode === 'ai') throw err;
        logger.warn(`[AITextService] LP AI failed, using local: ${err}`);
        return generateLandingPageCopy(plan, { ...genOptions, mode: 'local' });
      }
    }

    logger.info('[AITextService] Generating landing page with local engine');
    return generateLandingPageCopy(plan, genOptions);
  }

  /**
   * Gera roteiro de mídia com falas/narração (usa mediaAdapter).
   * Fallback para geração local se IA não disponível ou falhar.
   */
  async generateMediaScript(
    plan: MediaPlan,
    options: AITextServiceOptions = {},
  ): Promise<GeneratedMediaScript> {
    const adapter = this.mediaAdapter;
    const useAI = this.shouldUseAI(adapter);
    const genOptions: TextGenerationOptions = {
      mode: useAI ? 'ai' : 'local',
      tone: options.tone,
      projectName: options.projectName ?? plan.title ?? undefined,
    };

    if (useAI && adapter) {
      logger.info(`[AITextService] Generating media script with ${adapter.provider}`);
      try {
        return await generateMediaScript(plan, genOptions, adapter);
      } catch (err) {
        if (this.mode === 'ai') throw err;
        logger.warn(`[AITextService] Media script AI failed, using local: ${err}`);
        return generateMediaScript(plan, { ...genOptions, mode: 'local' });
      }
    }

    logger.info('[AITextService] Generating media script with local engine');
    return generateMediaScript(plan, genOptions);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private shouldUseAI(adapter: IAIAdapter | null): boolean {
    if (this.mode === 'local') return false;
    if (this.mode === 'ai') return true;  // 'ai' mode: assume adapter available (validated in willUseAI)
    return adapter !== null; // 'auto': usa IA se adapter disponível
  }
}
