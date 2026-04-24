"use client";

/**
 * useJobsList — lista de jobs do tenant com polling leve.
 *
 * Substitui useRealtimeJobs (que usava Supabase Realtime). Agora chama
 * GET /api/v1/dashboard/jobs periodicamente. Para updates em tempo real
 * de UM job específico (ex: acompanhar pipeline), use useJobEvents (SSE).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { bookagent, type DashboardJob } from "@/lib/bookagentApi";

interface UseJobsListOptions {
  limit?: number;
  pollIntervalMs?: number;
}

interface UseJobsListResult {
  jobs: DashboardJob[];
  total: number;
  loading: boolean;
  error: string | null;
  /** Mantido por compat com useRealtimeJobs (sempre false agora) */
  isRealtime: boolean;
  refresh: () => Promise<void>;
}

export function useJobsList(opts: UseJobsListOptions = {}): UseJobsListResult {
  const { limit = 50, pollIntervalMs = 30_000 } = opts;
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await bookagent.dashboard.jobs(limit);
      setJobs(res.jobs);
      setTotal(res.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar jobs");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, pollIntervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load, pollIntervalMs]);

  return { jobs, total, loading, error, isRealtime: false, refresh: load };
}

// Backward-compat alias pra não quebrar código que importa com o nome antigo
export { useJobsList as useRealtimeJobs };
