/**
 * useRealtimeJobs — hook que combina fetch inicial + Realtime updates.
 *
 * 1. Carrega jobs via bookagentApi (REST)
 * 2. Abre subscription Supabase Realtime
 * 3. Merge updates no estado local (INSERT/UPDATE/DELETE)
 * 4. Cleanup automático no unmount
 *
 * Fallback: se Supabase não está configurado, funciona com polling (30s).
 */

"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { bookagent, type DashboardJob } from '@/lib/bookagentApi';
import {
  subscribeToJobs,
  type RealtimeJobPayload,
} from '@/lib/supabase/realtime';

interface UseRealtimeJobsOptions {
  tenantId?: string;
  limit?: number;
  pollIntervalMs?: number;
}

interface UseRealtimeJobsResult {
  jobs: DashboardJob[];
  total: number;
  loading: boolean;
  error: string | null;
  isRealtime: boolean;
  refresh: () => Promise<void>;
}

/**
 * Mapeia row do Supabase → DashboardJob shape.
 */
function realtimeRowToJob(row: RealtimeJobPayload): DashboardJob {
  return {
    jobId: row.job_id,
    status: row.status,
    statusLabel: row.status.replace(/_/g, ' ').toLowerCase(),
    statusBadge: row.status === 'COMPLETED' ? 'success' : row.status === 'FAILED' ? 'error' : 'default',
    inputType: 'pdf',
    inputFileUrl: null,
    artifactsCount: row.artifacts_count ?? 0,
    publicationsCount: 0,
    hasPendingReview: false,
    qualityScore: null,
    createdAt: row.created_at,
    completedAt: row.updated_at,
  };
}

export function useRealtimeJobs(
  options: UseRealtimeJobsOptions = {},
): UseRealtimeJobsResult {
  const { tenantId, limit = 100, pollIntervalMs = 30_000 } = options;

  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRealtime, setIsRealtime] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  // Fetch initial data via REST
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await bookagent.dashboard.jobs(limit);
      setJobs(result.jobs);
      setTotal(result.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar jobs');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // Realtime subscription
  useEffect(() => {
    if (!tenantId) return;

    try {
      const unsub = subscribeToJobs(tenantId, (eventType, row) => {
        const updated = realtimeRowToJob(row);

        setJobs((prev) => {
          if (eventType === 'INSERT') {
            // Add to top, respect limit
            return [updated, ...prev].slice(0, limit);
          }
          if (eventType === 'UPDATE') {
            return prev.map((j) =>
              j.jobId === updated.jobId ? { ...j, ...updated } : j,
            );
          }
          if (eventType === 'DELETE') {
            return prev.filter((j) => j.jobId !== updated.jobId);
          }
          return prev;
        });

        if (eventType === 'INSERT') {
          setTotal((prev) => prev + 1);
        } else if (eventType === 'DELETE') {
          setTotal((prev) => Math.max(0, prev - 1));
        }
      });

      unsubRef.current = unsub;
      setIsRealtime(true);
    } catch {
      // Supabase not configured — fallback to polling
      setIsRealtime(false);
    }

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [tenantId, limit]);

  // Polling fallback when Realtime not available
  useEffect(() => {
    if (isRealtime) return;

    const interval = setInterval(load, pollIntervalMs);
    return () => clearInterval(interval);
  }, [isRealtime, load, pollIntervalMs]);

  return { jobs, total, loading, error, isRealtime, refresh: load };
}
