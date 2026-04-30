/**
 * Shared dependency factory — usado por worker e renderer pra montar a
 * forma de TaskHandlerDeps consumida pelos handlers em queue/task-handlers.
 *
 * Mantém-se simples e procedural: nada de DI container — só uma função
 * que monta um objeto a partir das peças já existentes no bootstrap.
 */

import type { Orchestrator } from '../../core/orchestrator.js';
import type { PersistentOrchestrator } from '../../persistence/persistent-orchestrator.js';
import type { StorageManager } from '../../persistence/storage-manager.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { JobRepository } from '../../persistence/job-repository.js';
import { ArtifactRepository } from '../../persistence/artifact-repository.js';
import type { TaskHandlerDeps } from '../../queue/task-handlers.js';

export interface TaskDepsInput {
  orchestrator: Orchestrator | PersistentOrchestrator;
  storageManager: StorageManager | null;
  supabaseClient: SupabaseClient | null;
}

export function buildTaskHandlerDeps(input: TaskDepsInput): TaskHandlerDeps {
  return {
    orchestrator: input.orchestrator,
    jobRepo: input.supabaseClient ? new JobRepository(input.supabaseClient) : null,
    artifactRepo: input.supabaseClient ? new ArtifactRepository(input.supabaseClient) : null,
    storageManager: input.storageManager,
    supabaseClient: input.supabaseClient,
  };
}

// ---------------------------------------------------------------------------
// SERVICE_ROLE dispatch helper
// ---------------------------------------------------------------------------

export type ServiceRole = 'api' | 'worker' | 'renderer' | 'all';

export function resolveServiceRole(): ServiceRole {
  const raw = (process.env.SERVICE_ROLE ?? 'all').toLowerCase().trim();
  if (raw === 'api' || raw === 'worker' || raw === 'renderer') return raw;
  return 'all';
}

export function shouldMount(target: Exclude<ServiceRole, 'all'>, role: ServiceRole): boolean {
  return role === 'all' || role === target;
}
