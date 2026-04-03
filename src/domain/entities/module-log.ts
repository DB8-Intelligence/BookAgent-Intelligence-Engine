/**
 * Entity: ModuleExecutionLog
 *
 * Registro de execução de um módulo do pipeline.
 * Captura métricas, status e erros para diagnóstico e dashboard futuro.
 */

import type { PipelineStage, ModuleStatus } from '../value-objects/index.js';

export interface ModuleExecutionLog {
  /** Estágio executado */
  stage: PipelineStage;

  /** Nome do módulo */
  moduleName: string;

  /** Status da execução */
  status: ModuleStatus;

  /** Duração em milissegundos */
  durationMs: number;

  /** Timestamp de início */
  startedAt: Date;

  /** Timestamp de conclusão */
  completedAt: Date;

  /** Mensagem de erro (se houver) */
  error?: string;

  /** Warnings gerados durante execução */
  warnings: string[];

  /** Métricas do módulo (assets gerados, fontes criadas, etc.) */
  metrics: ModuleMetrics;
}

export interface ModuleMetrics {
  /** Número de itens processados */
  itemsProcessed: number;

  /** Número de itens gerados/criados */
  itemsCreated: number;

  /** Número de itens ignorados/descartados */
  itemsSkipped: number;

  /** Métricas extras específicas do módulo */
  extra: Record<string, unknown>;
}

/** Cria um log com valores default */
export function createEmptyMetrics(): ModuleMetrics {
  return {
    itemsProcessed: 0,
    itemsCreated: 0,
    itemsSkipped: 0,
    extra: {},
  };
}
