/**
 * IOrchestratorLike — Interface pública do Orchestrator
 *
 * Permite que controllers aceitem tanto o Orchestrator base (in-memory)
 * quanto o PersistentOrchestrator (com Supabase) sem acoplamento.
 *
 * Ambas as implementações devem satisfazer esta interface estruturalmente.
 */

import type { Job, JobInput } from '../../domain/entities/job.js';
import type { IModule } from '../../domain/interfaces/module.js';

export interface IOrchestratorLike {
  registerModule(mod: IModule): void;
  process(input: JobInput): Promise<Job>;
  getJobStatus(jobId: string): Job | undefined;
  listJobs(): Job[];
}
