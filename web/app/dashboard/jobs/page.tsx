"use client";

import { useState } from "react";
import Link from "next/link";
import {
  bookagent,
  type DashboardJob,
} from "@/lib/bookagentApi";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { useRealtimeJobs } from "@/hooks/useJobsList";
import { extractMaterialName } from "@/lib/materialName";

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
  const { jobs, total, loading, error, isRealtime, refresh } = useRealtimeJobs();
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = filter === "ALL"
    ? jobs
    : jobs.filter((j) => j.status === filter);

  async function handleDelete(job: DashboardJob) {
    const name = extractMaterialName(job.inputFileUrl ?? undefined);
    if (!confirm(`Deletar o job "${name}"? Todos os artifacts e publicações serão removidos. Essa ação é irreversível.`)) {
      return;
    }
    setDeleting(job.jobId);
    try {
      await bookagent.jobs.delete(job.jobId);
      if (refresh) refresh();
    } catch (err) {
      alert(`Erro ao deletar: ${err instanceof Error ? err.message : "desconhecido"}`);
    } finally {
      setDeleting(null);
    }
  }

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
        action={
          isRealtime ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Ao vivo
            </span>
          ) : undefined
        }
      />

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTER_OPTIONS.map((opt) => (
          <button
            type="button"
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
          <div className="hidden sm:grid sm:grid-cols-[2fr_110px_70px_100px_180px] gap-4 px-4 py-2.5 bg-slate-50 border-b text-xs font-medium text-slate-500 uppercase tracking-wider">
            <span>Material</span>
            <span>Status</span>
            <span className="text-center">Artifacts</span>
            <span>Criado em</span>
            <span className="text-right">Ações</span>
          </div>

          {/* Table rows */}
          <div className="divide-y">
            {filtered.map((job) => {
              const materialName = extractMaterialName(job.inputFileUrl ?? undefined);
              const hasArtifacts = job.artifactsCount > 0;
              return (
                <div
                  key={job.jobId}
                  className="grid grid-cols-1 sm:grid-cols-[2fr_110px_70px_100px_180px] gap-2 sm:gap-4 items-center px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  {/* Material name + ID */}
                  <Link href={`/dashboard/jobs/${job.jobId}`} className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{materialName}</p>
                    <p className="text-xs font-mono text-slate-400">
                      {job.jobId.slice(0, 8)}
                    </p>
                  </Link>

                  {/* Status */}
                  <div>
                    <StatusBadge status={job.status} />
                  </div>

                  {/* Artifacts count */}
                  <div className="text-center">
                    <span className="text-sm text-slate-700">{job.artifactsCount}</span>
                  </div>

                  {/* Created at */}
                  <div>
                    <span className="text-sm text-slate-500">
                      {new Date(job.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2">
                    {hasArtifacts && (
                      <Link
                        href={`/outputs/${job.jobId}`}
                        className="text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                      >
                        Ver produtos
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(job)}
                      disabled={deleting === job.jobId}
                      className="text-xs text-red-600 hover:text-red-800 hover:underline disabled:opacity-50"
                      title="Deletar job"
                    >
                      {deleting === job.jobId ? "Deletando..." : "Deletar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
