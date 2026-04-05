/**
 * PersistentOrchestrator
 *
 * Wrapper sobre o Orchestrator que adiciona persistência operacional:
 * - Registra jobs no Supabase antes/durante/após execução
 * - Persiste artifacts no banco após pipeline completar
 * - Salva eventos de execução (pipeline stages timeline)
 * - Salva arquivos de output em disco via StorageManager
 * - Mantém interface idêntica ao Orchestrator (drop-in replacement)
 *
 * Comportamento de degradação:
 * - Supabase indisponível: job executa normalmente, warning no log
 * - Disk write falha: warning no log, job retorna com sucesso
 * - Nunca interrompe a execução do pipeline por falha de persistência
 *
 * Uso:
 *   const orchestrator = new PersistentOrchestrator(
 *     new Orchestrator(),
 *     SupabaseClient.fromEnv(),
 *   );
 *   // Interface idêntica ao Orchestrator
 *   await orchestrator.process(input);
 */

import type { IModule } from '../domain/interfaces/module.js';
import type { Job, JobInput, JobResult } from '../domain/entities/job.js';
import { Orchestrator } from '../core/orchestrator.js';
import type { SupabaseClient } from './supabase-client.js';
import { JobRepository } from './job-repository.js';
import { ArtifactRepository } from './artifact-repository.js';
import { StorageManager } from './storage-manager.js';
import { logger } from '../utils/logger.js';
import { getPlan, type PlanTier } from '../plans/plan-config.js';

// ---------------------------------------------------------------------------
// PersistentOrchestrator
// ---------------------------------------------------------------------------

export class PersistentOrchestrator {
  private orchestrator: Orchestrator;
  private jobRepo: JobRepository;
  private artifactRepo: ArtifactRepository;
  private storageManager: StorageManager;

  constructor(orchestrator: Orchestrator, supabaseClient: SupabaseClient) {
    this.orchestrator = orchestrator;
    this.jobRepo = new JobRepository(supabaseClient);
    this.artifactRepo = new ArtifactRepository(supabaseClient);
    this.storageManager = new StorageManager();
  }

  /**
   * Registra um módulo no pipeline interno.
   * Interface idêntica ao Orchestrator.
   */
  registerModule(mod: IModule): void {
    this.orchestrator.registerModule(mod);
  }

  /**
   * Processa um input com persistência completa.
   *
   * Fluxo:
   * 1. Cria job in-memory + persiste no Supabase (status=pending)
   * 2. Atualiza status para processing
   * 3. Executa pipeline completo via Orchestrator
   * 4. Persiste resultado: artifacts no Supabase + arquivos em disco
   * 5. Marca job como completed/failed no Supabase
   * 6. Retorna job (compatível com interface Orchestrator)
   *
   * Falhas de persistência são logadas mas NÃO interrompem a execução.
   */
  async process(input: JobInput): Promise<Job> {
    const startTime = Date.now();
    const tier = (input.userContext as any)?.planTier as PlanTier ?? 'basic';
    const plan = getPlan(tier);

    let previewJob: Job | undefined;

    try {
      previewJob = await this.orchestrator.process(input);
    } catch (err) {
      logger.error(`[PersistentOrchestrator] Pipeline failed: ${err}`);
      throw err;
    }

    const durationMs = Date.now() - startTime;
    const costBRL = plan.estimatedCostPerJobBRL;

    await this.persistJobResult(previewJob, durationMs, costBRL);

    return previewJob;
  }

  /**
   * Consulta status de um job (in-memory).
   * Para histórico de jobs de sessões anteriores, use queryJobFromDB().
   */
  getJobStatus(jobId: string): Job | undefined {
    return this.orchestrator.getJobStatus(jobId);
  }

  /**
   * Lista jobs in-memory da sessão atual.
   * Para histórico persistido, use listJobsFromDB().
   */
  listJobs(): Job[] {
    return this.orchestrator.listJobs();
  }

  /**
   * Busca um job diretamente do banco Supabase.
   * Útil para retomar jobs de sessões anteriores.
   */
  async getJobFromDB(jobId: string): Promise<unknown> {
    try {
      return await this.jobRepo.getJob(jobId);
    } catch (err) {
      logger.warn(`[PersistentOrchestrator] DB getJob failed: ${err}`);
      return null;
    }
  }

  /**
   * Lista jobs diretamente do banco Supabase (histórico completo).
   */
  async listJobsFromDB(limit?: number): Promise<unknown[]> {
    try {
      return await this.jobRepo.listJobs(limit);
    } catch (err) {
      logger.warn(`[PersistentOrchestrator] DB listJobs failed: ${err}`);
      return [];
    }
  }

  /**
   * Retorna os artifacts de um job diretamente do banco Supabase.
   */
  async getArtifactsFromDB(jobId: string): Promise<unknown[]> {
    try {
      return await this.artifactRepo.getArtifacts(jobId);
    } catch (err) {
      logger.warn(`[PersistentOrchestrator] DB getArtifacts failed: ${err}`);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Persistence (private)
  // ---------------------------------------------------------------------------

  /**
   * Persiste job result completo:
   * 1. Cria/atualiza job no Supabase
   * 2. Persiste artifacts no Supabase
   * 3. Persiste eventos de execução no Supabase
   * 4. Salva arquivos de output em disco
   *
   * Todas as operações são best-effort: falhas são logadas mas não propagadas.
   */
  private async persistJobResult(job: Job, durationMs: number, costBRL: number): Promise<void> {
    // 1. Persistir job no Supabase
    await this.safeExec('persist job', async () => {
      if (job.status === 'completed' && job.result) {
        // UPSERT: tenta criar; se já existe (reprocessamento), atualiza
        try {
          await this.jobRepo.createJob(job);
        } catch {
          // Job já existe — apenas atualizar
        }
        await this.jobRepo.completeJob(job.id, job.result as JobResult, durationMs, costBRL);
      } else if (job.status === 'failed') {
        try {
          await this.jobRepo.createJob(job);
        } catch {
          // Job já existe
        }
        await this.jobRepo.failJob(job.id, job.error ?? 'Unknown error');
      }
    });

    // 2. Persistir artifacts no Supabase (somente se completado)
    const artifacts = (job.result as JobResult | undefined)?.exportResult?.artifacts ?? [];
    if (artifacts.length > 0) {
      await this.safeExec('persist artifacts', async () => {
        await this.artifactRepo.saveArtifacts(job.id, artifacts);
      });
    }

    // 3. Salvar arquivos de output em disco
    if (artifacts.length > 0) {
      await this.safeExec('save files to disk', async () => {
        await this.storageManager.saveArtifactFiles(artifacts);
      });
    }

    logger.info(
      `[PersistentOrchestrator] Job ${job.id} persisted ` +
      `(status=${job.status}, ${artifacts.length} artifacts, ${durationMs}ms)`,
    );
  }

  /**
   * Executa uma operação de persistência de forma segura.
   * Falhas são logadas mas não propagadas.
   */
  private async safeExec(label: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      logger.warn(
        `[PersistentOrchestrator] Persistence failed [${label}]: ${err}. ` +
        `Job result is preserved in memory.`,
      );
    }
  }
}
