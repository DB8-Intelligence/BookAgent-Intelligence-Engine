"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  bookagent,
  type DashboardJob,
  DASHBOARD_STATUS_CONFIG,
} from "@/lib/bookagentApi";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";

type FilterKey = "ALL" | "PROCESSING" | "AWAITING_REVIEW" | "APPROVED" | "PUBLISHED" | "FAILED";

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "ALL", label: "Todos" },
  { key: "PROCESSING", label: "Processando" },
  { key: "AWAITING_REVIEW", label: "Aguardando" },
  { key: "APPROVED", label: "Aprovado" },
  { key: "PUBLISHED", label: "Publicado" },
  { key: "FAILED", label: "Falhou" },
];

export default function JobsListPage() {
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("ALL");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await bookagent.dashboard.jobs(100);
      setJobs(result.jobs);
      setTotal(result.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = filter === "ALL"
    ? jobs
    : jobs.filter((j) => j.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        Carregando...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <PageHeader title="Jobs" />
        <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-200">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Jobs"
        description={`${total} job${total !== 1 ? "s" : ""} no total`}
      />

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
              filter === opt.key
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Jobs table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="📋"
          title={filter === "ALL" ? "Nenhum job encontrado" : `Nenhum job com status "${FILTER_OPTIONS.find((o) => o.key === filter)?.label}"`}
          description="Envie um PDF para iniciar o processamento."
          action={{ label: "+ Novo Job", href: "/upload" }}
        />
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid sm:grid-cols-[1fr_120px_80px_80px_100px_120px] gap-4 px-4 py-2.5 bg-slate-50 border-b text-xs font-medium text-slate-500 uppercase tracking-wider">
            <span>Job ID</span>
            <span>Status</span>
            <span className="text-center">Artifacts</span>
            <span className="text-center">Publicacoes</span>
            <span className="text-center">Revisao</span>
            <span className="text-right">Criado em</span>
          </div>

          {/* Table rows */}
          <div className="divide-y">
            {filtered.map((job) => (
              <Link
                key={job.jobId}
                href={`/dashboard/jobs/${job.jobId}`}
                className="grid grid-cols-1 sm:grid-cols-[1fr_120px_80px_80px_100px_120px] gap-2 sm:gap-4 items-center px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                {/* Job ID */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-medium text-slate-900">
                    {job.jobId.slice(0, 8)}...
                  </span>
                  <span className="text-xs text-slate-400 sm:hidden">
                    {new Date(job.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>

                {/* Status */}
                <div>
                  <StatusBadge status={job.status} />
                </div>

                {/* Artifacts count */}
                <div className="text-center">
                  <span className="text-sm text-slate-700">{job.artifactsCount}</span>
                </div>

                {/* Publications count */}
                <div className="text-center">
                  <span className="text-sm text-slate-700">{job.publicationsCount}</span>
                </div>

                {/* Pending review */}
                <div className="text-center">
                  {job.hasPendingReview ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                      Pendente
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">--</span>
                  )}
                </div>

                {/* Created at */}
                <div className="text-right hidden sm:block">
                  <span className="text-sm text-slate-500">
                    {new Date(job.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
