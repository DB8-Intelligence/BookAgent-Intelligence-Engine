/**
 * BookAgent Intelligence Engine — Pipeline
 *
 * Executa módulos na ordem definida, passando o ProcessingContext
 * de estágio em estágio. Registra logs de execução automaticamente.
 *
 * Ordem de execução (15 estágios):
 *   1. Ingestion              → recebe arquivo, extrai texto bruto
 *   2. Book Analysis          → analisa compatibilidade do PDF, decide strategy
 *   3. Reverse Engineering    → analisa estrutura editorial, gera protótipo
 *   4. Extraction             → extrai imagens e assets do material
 *   5. Branding               → identifica paleta de cores, estilo, tipografia
 *   6. Correlation            → correlaciona texto ↔ imagem (usa branding como contexto)
 *   7. Source Intel            → classifica e estrutura fontes
 *   8. Narrative              → gera narrativas por fonte
 *   9. Output Selection       → decide quais formatos gerar
 *  10. Media Generation       → gera planos de mídia/vídeo
 *  11. Blog                   → gera planos de artigos para blog
 *  12. Landing Page           → gera planos de landing pages
 *  13. Personalization        → aplica logo, CTA e dados do usuário
 *  14. Content Scoring        → avalia qualidade dos outputs (Parte 70)
 *  15. Render/Export          → renderiza e exporta artefatos finais
 *  16. Delivery               → prepara entrega e notificação
 *  17. Performance Monitoring → métricas de custo e performance (Parte 71)
 */

import type { ProcessingContext } from './context.js';
import type { IModule } from '../domain/interfaces/module.js';
import type { JobResult } from '../domain/entities/job.js';
import type { ModuleExecutionLog } from '../domain/entities/module-log.js';
import { createEmptyMetrics } from '../domain/entities/module-log.js';
import { EMPTY_BRANDING } from '../domain/entities/branding.js';
import { PipelineStage, ModuleStatus } from '../domain/value-objects/index.js';
import { logger } from '../utils/logger.js';

/** Ordem fixa de execução dos 17 estágios */
const STAGE_ORDER: PipelineStage[] = [
  PipelineStage.INGESTION,
  PipelineStage.BOOK_ANALYSIS,
  PipelineStage.REVERSE_ENGINEERING,
  PipelineStage.EXTRACTION,
  PipelineStage.BRANDING,
  PipelineStage.CORRELATION,
  PipelineStage.SOURCE_INTELLIGENCE,
  PipelineStage.NARRATIVE,
  PipelineStage.OUTPUT_SELECTION,
  PipelineStage.MEDIA_GENERATION,
  PipelineStage.BLOG,
  PipelineStage.LANDING_PAGE,
  PipelineStage.PERSONALIZATION,
  PipelineStage.CONTENT_SCORING,
  PipelineStage.RENDER_EXPORT,
  PipelineStage.DELIVERY,
  PipelineStage.PERFORMANCE_MONITORING,
];

export class Pipeline {
  private modules: Map<PipelineStage, IModule> = new Map();

  /**
   * Registra um módulo para um estágio do pipeline.
   */
  registerModule(mod: IModule): void {
    this.modules.set(mod.stage, mod);
    logger.info(`Pipeline: módulo "${mod.name}" registrado para estágio [${mod.stage}]`);
  }

  /**
   * Executa todos os estágios na ordem definida.
   * Cada execução é cronometrada e registrada em executionLogs.
   */
  async execute(initialContext: ProcessingContext): Promise<JobResult> {
    let context = initialContext;
    const logs: ModuleExecutionLog[] = [];

    for (const stage of STAGE_ORDER) {
      const mod = this.modules.get(stage);
      if (!mod) continue;

      const startedAt = new Date();
      const startMs = Date.now();

      try {
        logger.info(`Pipeline: executando [${stage}] → ${mod.name}`);
        context = await mod.run(context);

        logs.push({
          stage,
          moduleName: mod.name,
          status: ModuleStatus.SUCCESS,
          durationMs: Date.now() - startMs,
          startedAt,
          completedAt: new Date(),
          warnings: [],
          metrics: createEmptyMetrics(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Pipeline: falha em [${stage}] → ${mod.name}: ${message}`);

        logs.push({
          stage,
          moduleName: mod.name,
          status: ModuleStatus.ERROR,
          durationMs: Date.now() - startMs,
          startedAt,
          completedAt: new Date(),
          error: message,
          warnings: [],
          metrics: createEmptyMetrics(),
        });

        // Propagar o erro para o orchestrator decidir
        throw error;
      }
    }

    // Anexar logs ao context final
    context = { ...context, executionLogs: logs };

    return {
      jobId: context.jobId,
      sources: context.sources ?? [],
      outputs: context.outputs ?? [],
      branding: context.branding ?? EMPTY_BRANDING,
      selectedOutputs: context.selectedOutputs,
      narratives: context.narratives,
      mediaPlans: context.mediaPlans,
      blogPlans: context.blogPlans,
      landingPagePlans: context.landingPagePlans,
      exportResult: context.exportResult,
      deliveryResult: context.deliveryResult,
    };
  }

  /**
   * Retorna a lista de estágios com módulo registrado.
   */
  getRegisteredStages(): PipelineStage[] {
    return Array.from(this.modules.keys());
  }
}
