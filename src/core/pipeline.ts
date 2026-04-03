/**
 * BookAgent Intelligence Engine — Pipeline
 *
 * Define a ordem de execução dos módulos e coordena
 * a passagem de dados entre cada estágio.
 *
 * Ordem de execução:
 *   1. Ingestion      → recebe arquivo, extrai texto bruto
 *   2. Extraction      → extrai imagens e assets do material
 *   3. Correlation     → correlaciona texto ↔ imagem
 *   4. Branding        → identifica paleta de cores, estilo, tipografia
 *   5. Source Intel     → classifica e estrutura fontes
 *   6. Narrative        → gera narrativas por fonte
 *   7. Output Selection → decide quais formatos gerar
 *   8. Media Generation → gera os outputs finais
 *   9. Personalization  → aplica logo, CTA e dados do usuário
 *
 * Cada estágio recebe o PipelineContext, enriquece-o e passa adiante.
 */

import { PipelineStage, type JobResult, type PipelineContext } from '../types/index.js';

export type StageHandler = (context: PipelineContext) => Promise<PipelineContext>;

export class Pipeline {
  private stages: Map<PipelineStage, StageHandler> = new Map();

  /**
   * Registra um handler para um estágio do pipeline.
   * Os módulos se registram aqui durante a inicialização.
   */
  registerStage(stage: PipelineStage, handler: StageHandler): void {
    this.stages.set(stage, handler);
  }

  /**
   * Executa todos os estágios na ordem definida.
   *
   * O contexto é passado de estágio em estágio,
   * acumulando dados extraídos e gerados.
   */
  async execute(initialContext: PipelineContext): Promise<JobResult> {
    const stageOrder: PipelineStage[] = [
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

    let context = initialContext;

    for (const stage of stageOrder) {
      const handler = this.stages.get(stage);
      if (handler) {
        context = await handler(context);
      }
      // Estágios sem handler registrado são ignorados silenciosamente.
      // Isso permite desenvolvimento incremental — módulos são adicionados conforme implementados.
    }

    return {
      jobId: context.jobId,
      sources: context.sources ?? [],
      outputs: context.outputs ?? [],
      branding: context.branding ?? {
        colors: { primary: '', secondary: '', accent: '', background: '', text: '' },
        style: '',
        composition: '',
      },
    };
  }

  /**
   * Retorna a lista de estágios com handler registrado.
   * Útil para diagnóstico e health-check.
   */
  getRegisteredStages(): PipelineStage[] {
    return Array.from(this.stages.keys());
  }
}
