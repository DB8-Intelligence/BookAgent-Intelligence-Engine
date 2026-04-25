/**
 * IBookStepHandler — contrato de um handler de step editorial
 *
 * Espelha o padrão de `IModule` (src/domain/interfaces/module.ts) mas serve ao
 * bounded context editorial: steps multi-execução com gates de aprovação e
 * estado persistido entre chamadas.
 *
 * Um handler é invocado pelo `book-editorial-processor` com um
 * `BookEditorialContext` construído a partir do banco. Ele executa sua lógica
 * e retorna um `BookStepResult` descrevendo o desfecho:
 *  - artefatos gerados (a serem persistidos em `book_artifacts`)
 *  - métricas (para `book_job_steps.metrics`)
 *  - decisão de transição: completed, awaiting_approval ou failed
 *  - opcionalmente, forçar o próximo step (override da sequência canônica)
 *
 * O handler NÃO deve:
 *  - tocar BullMQ diretamente
 *  - gravar em `book_jobs` / `book_job_steps` (isso é responsabilidade do
 *    processor, que garante atomicidade da transição)
 *  - guardar estado em variáveis de módulo
 */

import type { BookEditorialContext } from '../entities/book-editorial-context.js';
import type {
  BookStepName,
  BookArtifactKind,
} from '../entities/book-editorial.js';

/**
 * Desfecho da execução de um step.
 */
export type BookStepOutcome = 'completed' | 'awaiting_approval' | 'failed';

/**
 * Artefato a ser persistido pelo processor após o handler terminar.
 * Forma compacta — o repositório preenche `jobId`, `stepId`, timestamps.
 */
export interface BookStepArtifactOutput {
  kind: BookArtifactKind;
  title?: string;
  content: Record<string, unknown>;
  contentUrl?: string;
  version?: number;
}

/**
 * Resultado retornado por um handler. Descritivo — é o processor que
 * traduz este resultado em escritas de banco e enfileiramento do próximo step.
 */
export interface BookStepResult {
  outcome: BookStepOutcome;
  artifacts: BookStepArtifactOutput[];
  metrics?: Record<string, number>;
  /** Mensagem de erro estruturada. Obrigatório quando outcome === 'failed'. */
  error?: string;
  /**
   * Override explícito do próximo step. Use com cautela — por padrão o
   * processor segue `BOOK_EDITORIAL_SEQUENCE`. Só defina se o handler
   * precisar pular passos ou mudar a ordem deliberadamente.
   */
  nextStep?: BookStepName | null;
  /**
   * Se o outcome é `awaiting_approval`, indica o tipo de aprovação
   * requisitada. Default: 'intermediate'.
   */
  approvalKind?: 'intermediate' | 'final';
}

/**
 * Contrato do handler.
 *
 * Cada step editorial implementa uma classe com este shape. Handlers são
 * registrados no `book-editorial/registry.ts`.
 */
export interface IBookStepHandler {
  /** Nome canônico do step — precisa bater com `BookStepName`. */
  readonly step: BookStepName;
  /** Nome humano para logs. */
  readonly name: string;
  /** Execução. Deve ser pura no sentido de não gravar em book_* diretamente. */
  run(context: BookEditorialContext): Promise<BookStepResult>;
}
