"use client";

/**
 * useJobsList — lista de jobs do tenant via polling de GET /api/v1/dashboard/jobs.
 * Para acompanhar UM job em tempo real (ex: pipeline events), use useJobEvents (SSE).
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

  return { jobs, total, loading, error, refresh: load };
}
