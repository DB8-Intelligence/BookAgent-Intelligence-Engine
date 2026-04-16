/**
 * Supabase Realtime — subscriptions para o dashboard.
 *
 * Escuta changes em `bookagent_jobs` para atualizar o dashboard
 * em tempo real sem polling.
 *
 * Uso:
 *   const unsub = subscribeToJobs(tenantId, (payload) => { ... });
 *   // cleanup:
 *   unsub();
 */

import { getSupabaseBrowser } from './client';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RealtimeJobPayload {
  id: string;
  job_id: string;
  tenant_id: string;
  status: string;
  current_stage: string | null;
  progress_percent: number | null;
  artifacts_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export type JobChangeHandler = (
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: RealtimeJobPayload,
) => void;

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

/**
 * Escuta INSERT/UPDATE/DELETE na tabela `bookagent_jobs` para um tenant.
 * Retorna função de cleanup.
 */
export function subscribeToJobs(
  tenantId: string,
  onJobChange: JobChangeHandler,
): () => void {
  const supabase = getSupabaseBrowser();

  const channel = supabase
    .channel(`jobs:${tenantId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bookagent_jobs',
        filter: `tenant_id=eq.${tenantId}`,
      },
      (payload: RealtimePostgresChangesPayload<RealtimeJobPayload>) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
        const row = (payload.new ?? payload.old) as RealtimeJobPayload;
        if (row) {
          onJobChange(eventType, row);
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Escuta mudancas em artifacts de um job especifico.
 */
export function subscribeToJobArtifacts(
  jobId: string,
  onArtifactChange: (
    eventType: 'INSERT' | 'UPDATE',
    artifact: Record<string, unknown>,
  ) => void,
): () => void {
  const supabase = getSupabaseBrowser();

  const channel = supabase
    .channel(`artifacts:${jobId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bookagent_artifacts',
        filter: `job_id=eq.${jobId}`,
      },
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE';
        const row = (payload.new ?? payload.old) as Record<string, unknown>;
        if (row) {
          onArtifactChange(eventType, row);
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
