"use client";

import { useEffect, useState, useCallback } from "react";
import { bookagent, type DashboardAnalytics } from "@/lib/bookagentApi";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { KPICard } from "@/components/dashboard/KPICard";
import { EmptyState } from "@/components/dashboard/EmptyState";

export default function AnalyticsPage() {
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await bookagent.dashboard.analytics();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">Carregando...</div>;
  if (error) return <div className="p-4 bg-red-50 text-red-600 rounded-lg">{error}</div>;
  if (!data) return null;

  const maxThroughput = Math.max(...data.jobs.throughput.map((t) => t.count), 1);
  const platformEntries = Object.entries(data.publications.byPlatform);
  const maxPlatform = Math.max(...platformEntries.map(([, v]) => v), 1);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Analytics"
        description={`Periodo: ${new Date(data.period.from).toLocaleDateString("pt-BR")} - ${new Date(data.period.to).toLocaleDateString("pt-BR")}`}
      />

      {/* Jobs Section */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Jobs</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <KPICard label="Total de jobs" value={data.jobs.total} icon="&#128203;" />
          <KPICard label="Taxa de sucesso" value={`${data.jobs.successRate}%`} icon="&#9989;" />
          <KPICard label="Dias com atividade" value={data.jobs.throughput.length} icon="&#128197;" />
        </div>

        {/* Throughput Bar Chart */}
        {data.jobs.throughput.length > 0 && (
          <div className="bg-white border rounded-lg p-4">
            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Throughput diario</h3>
            <div className="flex items-end gap-1" style={{ height: 120 }}>
              {data.jobs.throughput.map((t) => {
                const heightPercent = (t.count / maxThroughput) * 100;
                return (
                  <div key={t.date} className="flex-1 flex flex-col items-center gap-1 group">
                    <span className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      {t.count}
                    </span>
                    <div
                      className="w-full bg-slate-700 rounded-t hover:bg-slate-900 transition-colors"
                      style={{ height: `${Math.max(heightPercent, 2)}%` }}
                      title={`${t.date}: ${t.count} jobs`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-slate-400">
                {new Date(data.jobs.throughput[0].date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              </span>
              <span className="text-[10px] text-slate-400">
                {new Date(data.jobs.throughput[data.jobs.throughput.length - 1].date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Publications Section */}
      <div>
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Publicacoes</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <KPICard label="Total de publicacoes" value={data.publications.total} icon="&#128227;" />
          <KPICard label="Taxa de sucesso" value={`${data.publications.successRate}%`} icon="&#9989;" />
        </div>

        {/* Platform Breakdown */}
        {platformEntries.length > 0 && (
          <div className="bg-white border rounded-lg p-4">
            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Por plataforma</h3>
            <div className="space-y-3">
              {platformEntries.map(([platform, count]) => {
                const widthPercent = (count / maxPlatform) * 100;
                return (
                  <div key={platform}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-700 capitalize">{platform}</span>
                      <span className="text-sm font-medium text-slate-900">{count}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-slate-700 rounded-full transition-all"
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
