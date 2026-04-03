/**
 * BookAgent Intelligence Engine — Job Manager
 *
 * Gerencia o ciclo de vida dos jobs de processamento.
 *
 * Responsabilidades:
 * - Criar jobs com ID único
 * - Atualizar status (pending → processing → completed/failed)
 * - Armazenar resultados
 * - Permitir consulta de status
 *
 * Implementação atual: in-memory (Map).
 * Evolução futura: Redis, PostgreSQL ou fila persistente.
 */

import { v4 as uuidv4 } from 'uuid';
import { JobStatus } from '../domain/value-objects/index.js';
import type { Job, JobInput, JobResult } from '../domain/entities/job.js';

export class JobManager {
  private jobs: Map<string, Job> = new Map();

  /**
   * Cria um novo job no estado PENDING.
   */
  createJob(input: JobInput): Job {
    const job: Job = {
      id: uuidv4(),
      status: JobStatus.PENDING,
      input,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.jobs.set(job.id, job);
    return job;
  }

  /**
   * Marca um job como em processamento.
   */
  markProcessing(jobId: string): void {
    this.updateJob(jobId, { status: JobStatus.PROCESSING });
  }

  /**
   * Marca um job como concluído com resultado.
   */
  markCompleted(jobId: string, result: JobResult): void {
    this.updateJob(jobId, { status: JobStatus.COMPLETED, result });
  }

  /**
   * Marca um job como falho com mensagem de erro.
   */
  markFailed(jobId: string, error: string): void {
    this.updateJob(jobId, { status: JobStatus.FAILED, error });
  }

  /**
   * Retorna um job pelo ID.
   */
  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Lista todos os jobs registrados.
   */
  listJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  private updateJob(jobId: string, updates: Partial<Job>): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    Object.assign(job, updates, { updatedAt: new Date() });
  }
}
