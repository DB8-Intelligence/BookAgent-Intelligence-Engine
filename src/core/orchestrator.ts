/**
 * BookAgent Intelligence Engine — Orchestrator
 *
 * Cérebro do sistema. Responsável por:
 * - Receber inputs (PDF, vídeo, áudio, etc.)
 * - Construir o ProcessingContext
 * - Iniciar o pipeline de processamento
 * - Coordenar a execução dos módulos na ordem correta
 * - Retornar o resultado final ao chamador
 *
 * O orchestrator não contém lógica de negócio — ele delega
 * para o pipeline e os módulos individuais.
 */

import type { Job, JobInput } from '../domain/entities/job.js';
import type { IModule } from '../domain/interfaces/module.js';
import { createContext } from './context.js';
import { JobManager } from './job-manager.js';
import { Pipeline } from './pipeline.js';

export class Orchestrator {
  private pipeline: Pipeline;
  private jobManager: JobManager;

  constructor() {
    this.pipeline = new Pipeline();
    this.jobManager = new JobManager();
  }

  /**
   * Registra um módulo no pipeline.
   * Deve ser chamado durante a inicialização da aplicação.
   */
  registerModule(mod: IModule): void {
    this.pipeline.registerModule(mod);
  }

  /**
   * Processa um input completo — da ingestão até a geração de outputs.
   *
   * Fluxo:
   * 1. Cria um job no JobManager
   * 2. Constrói o ProcessingContext
   * 3. Executa o pipeline completo
   * 4. Atualiza o job com o resultado
   * 5. Retorna o job atualizado
   */
  async process(input: JobInput): Promise<Job> {
    const job = this.jobManager.createJob(input);

    try {
      this.jobManager.markProcessing(job.id);

      const context = createContext(job.id, input);
      const result = await this.pipeline.execute(context);

      this.jobManager.markCompleted(job.id, result);
      return this.jobManager.getJob(job.id)!;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.jobManager.markFailed(job.id, message);
      return this.jobManager.getJob(job.id)!;
    }
  }

  /**
   * Consulta o status de um job existente.
   */
  getJobStatus(jobId: string): Job | undefined {
    return this.jobManager.getJob(jobId);
  }

  /**
   * Lista todos os jobs registrados.
   */
  listJobs(): Job[] {
    return this.jobManager.listJobs();
  }
}
