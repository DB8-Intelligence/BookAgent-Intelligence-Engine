/**
 * BookAgent Intelligence Engine — Pipeline
 *
 * Executa módulos na ordem definida, passando o ProcessingContext
 * de estágio em estágio.
 *
 * Ordem de execução:
 *   1. Ingestion       → recebe arquivo, extrai texto bruto
 *   2. Extraction      → extrai imagens e assets do material
 *   3. Correlation     → correlaciona texto ↔ imagem
 *   4. Branding        → identifica paleta de cores, estilo, tipografia
 *   5. Source Intel     → classifica e estrutura fontes
 *   6. Narrative        → gera narrativas por fonte
 *   7. Output Selection → decide quais formatos gerar
 *   8. Media Generation → gera os outputs finais
 *   9. Personalization  → aplica logo, CTA e dados do usuário
 *
 * Os módulos implementam IModule e são registrados durante a inicialização.
 */

import type { ProcessingContext } from './context.js';
import type { IModule } from '../domain/interfaces/module.js';
import type { JobResult } from '../domain/entities/job.js';
import { EMPTY_BRANDING } from '../domain/entities/branding.js';
import { PipelineStage } from '../domain/value-objects/index.js';
import { logger } from '../utils/logger.js';

/** Ordem fixa de execução dos estágios */
const STAGE_ORDER: PipelineStage[] = [
  PipelineStage.INGESTION,
  PipelineStage.EXTRACTION,
  PipelineStage.CORRELATION,
  PipelineStage.BRANDING,
  PipelineStage.SOURCE_INTELLIGENCE,
  PipelineStage.NARRATIVE,
  PipelineStage.OUTPUT_SELECTION,
  PipelineStage.MEDIA_GENERATION,
  PipelineStage.PERSONALIZATION,
];

export class Pipeline {
  private modules: Map<PipelineStage, IModule> = new Map();

  /**
   * Registra um módulo para um estágio do pipeline.
   * Cada módulo implementa IModule com stage, name e run().
   */
  registerModule(mod: IModule): void {
    this.modules.set(mod.stage, mod);
    logger.info(`Pipeline: módulo "${mod.name}" registrado para estágio [${mod.stage}]`);
  }

  /**
   * Executa todos os estágios na ordem definida.
   * Estágios sem módulo registrado são ignorados silenciosamente,
   * permitindo desenvolvimento incremental.
   */
  async execute(initialContext: ProcessingContext): Promise<JobResult> {
    let context = initialContext;

    for (const stage of STAGE_ORDER) {
      const mod = this.modules.get(stage);
      if (mod) {
        logger.info(`Pipeline: executando [${stage}] → ${mod.name}`);
        context = await mod.run(context);
      }
    }

    return {
      jobId: context.jobId,
      sources: context.sources ?? [],
      outputs: context.outputs ?? [],
      branding: context.branding ?? EMPTY_BRANDING,
    };
  }

  /**
   * Retorna a lista de estágios com módulo registrado.
   */
  getRegisteredStages(): PipelineStage[] {
    return Array.from(this.modules.keys());
  }
}
