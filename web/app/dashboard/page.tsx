"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { bookagent, type DashboardOverview } from "@/lib/bookagentApi";
import { KPICard } from "@/components/dashboard/KPICard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { PageHeader } from "@/components/dashboard/PageHeader";

export default function DashboardOverviewPage() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const overview = await bookagent.dashboard.overview();
      setData(overview);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">Carregando...</div>;
  if (error) return <div className="p-4 bg-red-50 text-red-600 rounded-lg">{error}</div>;
  if (!data) return null;

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title={`Ola, ${data.tenantName}`}
        description={`Plano ${data.planTier.toUpperCase()} - ${data.subscriptionStatus}`}
        action={
          <Link href="/upload" className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800">
            + Novo Job
          </Link>
        }
      />

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="space-y-2 mb-6">
          {data.alerts.map((alert, i) => (
            <div key={i} className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
              alert.type === "error" ? "bg-red-50 text-red-700 border border-red-200" :
              alert.type === "warning" ? "bg-amber-50 text-amber-700 border border-amber-200" :
              "bg-blue-50 text-blue-700 border border-blue-200"
            }`}>
              <span>{alert.type === "error" ? "🔴" : alert.type === "warning" ? "🟡" : "🔵"}</span>
              <div>
                <p className="font-medium">{alert.title}</p>
                <p className="text-xs mt-0.5">{alert.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KPICard label="Jobs este mes" value={data.stats.jobsThisMonth} icon="📋" />
        <KPICard label="Jobs total" value={data.stats.jobsTotal} icon="📦" />
        <KPICard label="Artifacts" value={data.stats.artifactsGenerated} icon="🎨" />
        <KPICard label="Publicados" value={data.stats.publicationsSucceeded} icon="📢" />
        <KPICard label="Aguardando revisao" value={data.stats.pendingReviews} icon="👀" />
        <KPICard label="Revisoes ativas" value={data.stats.activeRevisions} icon="🔄" />
      </div>

      {/* Usage bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <UsageBar label="Jobs" used={data.usage.jobsUsed} limit={data.usage.jobsLimit} percent={data.usage.jobsPercent} />
        <UsageBar label="Renders" used={data.usage.rendersUsed} limit={data.usage.rendersLimit} percent={data.usage.rendersPercent} />
      </div>

      {/* Recent Jobs */}
      <div className="bg-white border rounded-lg">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Jobs recentes</h2>
          <Link href="/dashboard/jobs" className="text-sm text-blue-600 hover:underline">Ver todos</Link>
        </div>
        {data.recentJobs.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">Nenhum job ainda. Comece enviando um PDF.</div>
        ) : (
          <div className="divide-y">
            {data.recentJobs.map((job) => (
              <Link key={job.jobId} href={`/dashboard/jobs/${job.jobId}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-lg">📄</span>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{job.jobId.slice(0, 8)}...</p>
                    <p className="text-xs text-slate-500">{new Date(job.createdAt).toLocaleDateString("pt-BR")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{job.artifactsCount} artifacts</span>
                  <StatusBadge status={job.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Locked features */}
      {data.lockedFeatures.length > 0 && (
        <div className="mt-6 bg-white border rounded-lg p-4">
          <h2 className="font-semibold text-slate-900 mb-3">Recursos disponiveis no upgrade</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {data.lockedFeatures.map((f) => (
              <div key={f.feature} className="flex items-start gap-2 p-2 rounded bg-slate-50">
                <span className="text-slate-400">🔒</span>
                <div>
                  <p className="text-sm font-medium text-slate-700">{f.label}</p>
                  <p className="text-xs text-slate-500">{f.description}</p>
                  <p className="text-xs text-blue-600 mt-0.5">Disponivel no plano {f.availableFrom.toUpperCase()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UsageBar({ label, used, limit, percent }: { label: string; used: number; limit: number; percent: number }) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="text-xs text-slate-500">{used}/{limit}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${percent > 90 ? "bg-red-500" : percent > 70 ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}
