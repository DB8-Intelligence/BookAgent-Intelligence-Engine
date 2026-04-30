/**
 * BookEditorialContext — DTO transiente de execução de step
 *
 * Este DTO é construído pelo `book-editorial-processor` a cada execução de
 * step, a partir de leituras frescas do banco (book_jobs, book_job_steps,
 * book_artifacts). É passado ao `IBookStepHandler.run()` e descartado ao fim.
 *
 * NÃO é persistido como blob. NÃO é fonte de verdade. O estado verdadeiro
 * vive nas tabelas normalizadas do bounded context editorial.
 *
 * Um handler que precisar de um artefato de step anterior deve buscá-lo
 * em `priorArtifacts` (já pré-carregado) ou em `artifactRepo` via injeção
 * se precisar buscar explicitamente.
 */

import type {
  BookJob,
  BookJobStep,
  BookArtifact,
} from './book-editorial.js';
import type { TenantContext } from './tenant.js';

/**
 * Contexto imutável passado ao handler de um step editorial.
 *
 * Propriedades readonly: o handler não deve mutar o contexto — ele retorna
 * um `BookStepResult` com os artefatos e a decisão de transição.
 */
export interface BookEditorialContext {
  /** Job editorial atualizado (snapshot no instante da execução). */
  readonly job: BookJob;
  /** Row do step corrente, já com status=running. */
  readonly currentStep: BookJobStep;
  /** Artefatos previamente gerados por steps anteriores deste job. */
  readonly priorArtifacts: readonly BookArtifact[];
  /** Contexto multi-tenant, se disponível. */
  readonly tenant: TenantContext | null;
}
