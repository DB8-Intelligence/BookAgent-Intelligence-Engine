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
import {
  emitPdfIngested,
  emitAssetsExtracted,
  emitScriptReady,
  emitMediaPlanReady,
  emitPipelineFailed,
  emitStageStarted,
  emitStageCompleted,
  emitPipelineCompleted,
} from './task-orchestrator.js';

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
   *
   * Otimização (Parte X — paralelização):
   *   Media Generation, Blog e Landing Page (estágios 10-12) são INDEPENDENTES
   *   entre si — todos consomem selectedOutputs+narratives e produzem campos
   *   distintos no context (mediaPlans, blogPlans, landingPagePlans).
   *   Rodamos eles em Promise.all → economia de ~2x no tempo desses 3 estágios.
   *
   *   Desligar via env: PIPELINE_PARALLEL_GENERATORS=false (default: true)
   */
  async execute(initialContext: ProcessingContext): Promise<JobResult> {
    const pipelineStartMs = Date.now();
    let context = initialContext;
    const logs: ModuleExecutionLog[] = [];
    const parallelGenerators = process.env.PIPELINE_PARALLEL_GENERATORS !== 'false';

    // Conditional execution: skip generator stages whose outputs the user
    // didn't request (wizard step 4). If user picked only "reel", we don't
    // waste time generating blog/LP plans. Big win for focused jobs.
    const skipGenerators = this.computeGeneratorSkips(context);

    // FAST_MODE: skip book-analysis + reverse-engineering (saves ~2-3 min).
    // Downstream modules already handle bookCompatibility/bookPrototype as
    // optional — assets still extract via default strategy, scene composer
    // falls back to role-based layouts.
    const fastMode = process.env.PIPELINE_FAST_MODE === 'true';
    if (fastMode) {
      skipGenerators.add(PipelineStage.BOOK_ANALYSIS);
      skipGenerators.add(PipelineStage.REVERSE_ENGINEERING);
      logger.info('[Pipeline] FAST_MODE on — skipping book-analysis + reverse-engineering');
    }

    if (skipGenerators.size > 0) {
      logger.info(
        `[Pipeline] Skipping stages: ${[...skipGenerators].join(', ')}`,
      );
    }

    // Parallel generator stages (media, blog, LP) — rodam juntos após OUTPUT_SELECTION
    const PARALLEL_STAGES: PipelineStage[] = [
      PipelineStage.MEDIA_GENERATION,
      PipelineStage.BLOG,
      PipelineStage.LANDING_PAGE,
    ].filter((s) => !skipGenerators.has(s));

    let i = 0;
    while (i < STAGE_ORDER.length) {
      const stage = STAGE_ORDER[i];

      // Skip generator stages the user didn't ask for (saves 1-2 min per skip)
      if (skipGenerators.has(stage)) {
        logger.info(`[Pipeline] Skipping [${stage}] — not in userSelectedFormats`);
        i++;
        continue;
      }

      // Check if we hit the parallelizable group
      if (parallelGenerators && stage === PipelineStage.MEDIA_GENERATION) {
        // Advance past the full parallel group even if we filtered some
        const oldI = i;
        i += 3; // media, blog, LP always occupy indices 9,10,11
        if (PARALLEL_STAGES.length > 0) {
          await this.runParallelGenerators(context, PARALLEL_STAGES, logs)
            .then((merged) => { context = merged; });
        } else {
          logger.info('[Pipeline] All parallel generators skipped');
        }
        // Guard: if MEDIA_GENERATION wasn't at index oldI for some reason, fallback
        if (STAGE_ORDER[oldI] !== PipelineStage.MEDIA_GENERATION) i = oldI + 1;
        continue;
      }

      const mod = this.modules.get(stage);
      if (!mod) { i++; continue; }

      const startedAt = new Date();
      const startMs = Date.now();

      // Emit stage-started (genérico) — pro SSE mostrar "IA processando branding…"
      await emitStageStarted(context.jobId, {
        stage: String(stage),
        stageIndex: i,
        totalStages: STAGE_ORDER.length,
      }).catch(() => {});

      try {
        logger.info(`Pipeline: executando [${stage}] → ${mod.name}`);
        context = await mod.run(context);

        const durationMs = Date.now() - startMs;
        logs.push({
          stage,
          moduleName: mod.name,
          status: ModuleStatus.SUCCESS,
          durationMs,
          startedAt,
          completedAt: new Date(),
          warnings: [],
          metrics: createEmptyMetrics(),
        });

        // Emit stage-completed (genérico) + eventos específicos do stage
        await emitStageCompleted(context.jobId, {
          stage: String(stage),
          stageIndex: i,
          totalStages: STAGE_ORDER.length,
          durationMs,
        }).catch(() => {});
        await this.emitStageEvents(stage, context).catch((err) => {
          logger.warn(`[Pipeline] emitStageEvents failed for ${stage}: ${err}`);
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

        // Publish failure event for any listeners (retry, alert, etc)
        await emitPipelineFailed(context.jobId, { stage: String(stage), error: message })
          .catch(() => {});

        // Propagar o erro para o orchestrator decidir
        throw error;
      }

      i++;
    }

    // Anexar logs ao context final
    context = { ...context, executionLogs: logs };

    // Emit pipeline-completed pro SSE sinalizar "tudo pronto"
    await emitPipelineCompleted(context.jobId, {
      totalDurationMs: Date.now() - pipelineStartMs,
      outputCount: context.outputs?.length ?? 0,
    }).catch(() => {});

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

  /**
   * Emite eventos Pub/Sub conforme o pipeline avança.
   * Workers (TTS, image processor, etc.) escutam esses tópicos e começam
   * trabalho em paralelo. Não bloqueia o pipeline — errors nos handlers
   * são logged mas ignored.
   */
  private async emitStageEvents(stage: PipelineStage, ctx: ProcessingContext): Promise<void> {
    switch (stage) {
      case PipelineStage.INGESTION:
        if (ctx.localFilePath) {
          await emitPdfIngested(ctx.jobId, {
            filePath: ctx.localFilePath,
            extractedText: ctx.extractedText ?? '',
            pageCount: ctx.pageTexts?.length ?? 0,
          });
        }
        break;

      case PipelineStage.EXTRACTION:
        if (ctx.assets && ctx.assets.length > 0) {
          await emitAssetsExtracted(ctx.jobId, {
            assetIds: ctx.assets.map((a) => a.id),
            assetUrlMap: ctx.assetUrlMap ?? {},
          });
        }
        break;

      case PipelineStage.NARRATIVE:
        if (ctx.narratives && ctx.narratives.length > 0) {
          await emitScriptReady(ctx.jobId, {
            narrativePlanIds: ctx.narratives.map((n) => n.id),
            scripts: ctx.narratives.map((n) => ({
              narrativeId: n.id,
              title: n.title,
              wordCount: n.estimatedWordCount ?? 0,
            })),
          });
        }
        break;

      case PipelineStage.MEDIA_GENERATION:
        if (ctx.mediaPlans && ctx.mediaPlans.length > 0) {
          await emitMediaPlanReady(ctx.jobId, {
            mediaPlanIds: ctx.mediaPlans.map((m) => m.id),
          });
        }
        break;

      // Other stages can be added as workers need them
      default:
        break;
    }
  }

  /**
   * Decide quais generator stages (Media / Blog / LP) podem ser pulados
   * baseado em userSelectedFormats. Se o user marcou só "reel", não faz
   * sentido rodar BlogModule.
   *
   * Mapeamento format → stage necessário:
   *   reel, carousel, story, post, presentation, video_long → MEDIA_GENERATION
   *   blog                                                   → BLOG
   *   landing_page                                           → LANDING_PAGE
   *
   * Se userSelectedFormats vazio/undefined, NÃO skipa nada (comportamento legado).
   */
  private computeGeneratorSkips(ctx: ProcessingContext): Set<PipelineStage> {
    const skips = new Set<PipelineStage>();
    const selected = ctx.userSelectedFormats;
    if (!selected || selected.length === 0) return skips;

    const normalized = new Set(
      selected.map((f) => f.toLowerCase().replace(/-/g, '_')),
    );

    // Media stage produces: reel, carousel, story, post, presentation, video_long
    const mediaFormats = ['reel', 'carousel', 'story', 'post', 'presentation', 'video_long'];
    const hasMedia = mediaFormats.some((f) => normalized.has(f));
    if (!hasMedia) skips.add(PipelineStage.MEDIA_GENERATION);

    if (!normalized.has('blog')) skips.add(PipelineStage.BLOG);
    if (!normalized.has('landing_page')) skips.add(PipelineStage.LANDING_PAGE);

    return skips;
  }

  /**
   * Executa vários estágios em paralelo e faz merge dos contexts resultantes.
   * Cada módulo retorna um novo ProcessingContext com seus campos populados;
   * fazemos shallow-merge na ordem dos estágios — campos sobrescritos pelo
   * último vencem, mas os 3 geradores tocam em campos distintos (mediaPlans,
   * blogPlans, landingPagePlans), então conflitos são zero.
   */
  private async runParallelGenerators(
    baseContext: ProcessingContext,
    stages: PipelineStage[],
    logs: ModuleExecutionLog[],
  ): Promise<ProcessingContext> {
    const runs = stages.map(async (stage) => {
      const mod = this.modules.get(stage);
      if (!mod) return null;

      const startedAt = new Date();
      const startMs = Date.now();
      const stageIndex = STAGE_ORDER.indexOf(stage);

      await emitStageStarted(baseContext.jobId, {
        stage: String(stage),
        stageIndex,
        totalStages: STAGE_ORDER.length,
      }).catch(() => {});

      try {
        logger.info(`Pipeline: executando [${stage}] → ${mod.name} (paralelo)`);
        const resultCtx = await mod.run(baseContext);

        const durationMs = Date.now() - startMs;
        logs.push({
          stage,
          moduleName: mod.name,
          status: ModuleStatus.SUCCESS,
          durationMs,
          startedAt,
          completedAt: new Date(),
          warnings: [],
          metrics: createEmptyMetrics(),
        });

        await emitStageCompleted(baseContext.jobId, {
          stage: String(stage),
          stageIndex,
          totalStages: STAGE_ORDER.length,
          durationMs,
        }).catch(() => {});

        return resultCtx;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Pipeline: falha paralela em [${stage}] → ${mod.name}: ${message}`);

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

        throw error;
      }
    });

    const results = await Promise.all(runs);

    // Merge: cada gerador toca em campos distintos (mediaPlans / blogPlans / landingPagePlans)
    return results.reduce<ProcessingContext>(
      (acc, ctx) => (ctx ? { ...acc, ...ctx } : acc),
      baseContext,
    );
  }
}
