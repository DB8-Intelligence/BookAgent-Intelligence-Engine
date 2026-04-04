/**
 * ProviderRouter — Roteamento Multi-Provider por Finalidade
 *
 * Resolve o adapter de IA correto para cada tipo de tarefa,
 * permitindo usar providers distintos conforme a necessidade:
 *
 *   blog / landing page → OpenAI  (GPT-4o para copy de alta conversão)
 *   media script / narrativa → Anthropic (Claude para raciocínio e fluidez)
 *   multimodal / análise de documentos → Gemini (visão nativa, PDFs)
 *
 * Resolução por prioridade (por tarefa):
 *   1. Variável de ambiente específica  (ex: AI_BLOG_PROVIDER=openai)
 *   2. Variável global AI_PROVIDER       (fallback default — backward compat)
 *   3. Auto-seleção inteligente          (baseada nas chaves disponíveis)
 *
 * Variáveis de ambiente:
 *   AI_BLOG_PROVIDER        anthropic | openai | gemini
 *   AI_LANDING_PROVIDER     anthropic | openai | gemini
 *   AI_MEDIA_PROVIDER       anthropic | openai | gemini
 *   AI_MULTIMODAL_PROVIDER  anthropic | openai | gemini
 *   AI_PROVIDER             fallback default para todas as tarefas
 *
 * Prioridade de auto-seleção (quando nenhum env var específico está definido):
 *   blog / landing_page  → openai → anthropic → gemini
 *   media_script         → anthropic → openai → gemini
 *   multimodal           → gemini → openai → anthropic
 */

import type { IAIAdapter } from '../domain/interfaces/ai-adapter.js';
import { AnthropicAdapter } from './ai/anthropic/index.js';
import { OpenAIAdapter } from './ai/openai/index.js';
import { GeminiAdapter } from './ai/gemini/index.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AITask = 'blog' | 'landing_page' | 'media_script' | 'multimodal';
export type RouterProviderName = 'anthropic' | 'openai' | 'gemini';

// Env var de configuração por tarefa
const TASK_ENV_VARS: Record<AITask, string> = {
  blog:         'AI_BLOG_PROVIDER',
  landing_page: 'AI_LANDING_PROVIDER',
  media_script: 'AI_MEDIA_PROVIDER',
  multimodal:   'AI_MULTIMODAL_PROVIDER',
};

// Prioridade de auto-seleção por tarefa (quando nenhum env var específico)
const AUTO_SELECT_PRIORITY: Record<AITask, RouterProviderName[]> = {
  blog:         ['openai', 'anthropic', 'gemini'],
  landing_page: ['openai', 'anthropic', 'gemini'],
  media_script: ['anthropic', 'openai', 'gemini'],
  multimodal:   ['gemini', 'openai', 'anthropic'],
};

// ---------------------------------------------------------------------------
// ProviderRouter
// ---------------------------------------------------------------------------

export class ProviderRouter {
  private adapters: Map<AITask, IAIAdapter | null> = new Map();

  private readonly hasAnthropic: boolean;
  private readonly hasOpenAI: boolean;
  private readonly hasGemini: boolean;

  constructor() {
    this.hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
    this.hasOpenAI    = !!process.env.OPENAI_API_KEY;
    this.hasGemini    = !!process.env.GEMINI_API_KEY;

    for (const task of Object.keys(TASK_ENV_VARS) as AITask[]) {
      this.adapters.set(task, this.resolveForTask(task));
    }

    this.logRouting();
  }

  /**
   * Retorna o adapter resolvido para a tarefa especificada.
   * Null se nenhum provider disponível → módulo usa geração local.
   */
  getAdapter(task: AITask): IAIAdapter | null {
    return this.adapters.get(task) ?? null;
  }

  /**
   * Indica se pelo menos um provider está disponível.
   */
  hasAnyProvider(): boolean {
    return this.hasAnthropic || this.hasOpenAI || this.hasGemini;
  }

  /**
   * Tabela de roteamento atual (para diagnóstico e logs).
   */
  getRoutingTable(): Record<AITask, string | null> {
    const table: Record<string, string | null> = {};
    for (const [task, adapter] of this.adapters.entries()) {
      table[task] = adapter?.provider ?? null;
    }
    return table as Record<AITask, string | null>;
  }

  /**
   * Lista de providers com API key disponível.
   */
  getAvailableProviders(): RouterProviderName[] {
    const available: RouterProviderName[] = [];
    if (this.hasAnthropic) available.push('anthropic');
    if (this.hasOpenAI)    available.push('openai');
    if (this.hasGemini)    available.push('gemini');
    return available;
  }

  // ---------------------------------------------------------------------------
  // Private — resolução
  // ---------------------------------------------------------------------------

  private resolveForTask(task: AITask): IAIAdapter | null {
    // 1. Env var específico por tarefa
    const specificEnv = process.env[TASK_ENV_VARS[task]] as RouterProviderName | undefined;
    if (specificEnv) {
      const adapter = this.buildAdapter(specificEnv);
      if (adapter) return adapter;
    }

    // 2. Env var global AI_PROVIDER (backward compat)
    const globalEnv = process.env.AI_PROVIDER as RouterProviderName | undefined;
    if (globalEnv) {
      const adapter = this.buildAdapter(globalEnv);
      if (adapter) return adapter;
    }

    // 3. Auto-seleção por prioridade da tarefa
    for (const provider of AUTO_SELECT_PRIORITY[task]) {
      const adapter = this.buildAdapter(provider);
      if (adapter) return adapter;
    }

    return null;
  }

  private buildAdapter(provider: RouterProviderName): IAIAdapter | null {
    switch (provider) {
      case 'anthropic':
        return this.hasAnthropic ? new AnthropicAdapter() : null;
      case 'openai':
        return this.hasOpenAI ? new OpenAIAdapter() : null;
      case 'gemini':
        return this.hasGemini ? new GeminiAdapter() : null;
      default:
        return null;
    }
  }

  private logRouting(): void {
    const available = this.getAvailableProviders();
    if (available.length === 0) {
      logger.info('[ProviderRouter] No API keys found — all tasks will use local generation');
      return;
    }

    logger.info(`[ProviderRouter] Keys available: ${available.join(', ')}`);
    const table = this.getRoutingTable();
    for (const [task, provider] of Object.entries(table)) {
      logger.info(`[ProviderRouter]   ${task.padEnd(14)} → ${provider ?? 'local'}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Cria um ProviderRouter com base nas variáveis de ambiente atuais.
 * Sempre retorna um router — que pode não ter providers disponíveis.
 */
export function createProviderRouter(): ProviderRouter {
  return new ProviderRouter();
}
