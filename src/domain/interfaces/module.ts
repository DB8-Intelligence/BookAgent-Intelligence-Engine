/**
 * Interface: IModule
 *
 * Contrato padrão que todos os módulos do pipeline devem implementar.
 * Garante uniformidade na execução: cada módulo recebe o ProcessingContext,
 * enriquece-o e devolve.
 */

import type { ProcessingContext } from '../../core/context.js';
import type { PipelineStage } from '../value-objects/index.js';

export interface IModule {
  /** Identificador do estágio que este módulo executa */
  readonly stage: PipelineStage;

  /** Nome legível do módulo (para logs e diagnóstico) */
  readonly name: string;

  /** Executa a lógica do módulo sobre o contexto de processamento */
  run(context: ProcessingContext): Promise<ProcessingContext>;
}
