"use client";

import { useEffect, useState, useCallback } from "react";
import { bookagent, type DashboardInsights } from "@/lib/bookagentApi";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { KPICard } from "@/components/dashboard/KPICard";
import { EmptyState } from "@/components/dashboard/EmptyState";

export default function InsightsPage() {
  const [data, setData] = useState<DashboardInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await bookagent.dashboard.insights();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar insights");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">Carregando...</div>;
  if (error) return <div className="p-4 bg-red-50 text-red-600 rounded-lg">{error}</div>;
  if (!data) return null;

  // Locked state — insights not available
  if (!data.available) {
    return (
      <div className="max-w-6xl mx-auto">
        <PageHeader title="Insights" />
        <div className="bg-white border rounded-lg p-8 text-center">
          <span className="text-4xl mb-4 block">&#128274;</span>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Insights indisponiveis</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Os insights de qualidade e recomendacoes estao disponiveis a partir do plano Pro.
            Faca upgrade para desbloquear analises inteligentes sobre seu conteudo.
          </p>
        </div>
      </div>
    );
  }

  const scoreColor =
    (data.averageQualityScore ?? 0) >= 80 ? "text-emerald-600" :
    (data.averageQualityScore ?? 0) >= 60 ? "text-amber-600" :
    "text-red-600";

  const trendIcon =
    data.qualityTrend === "up" ? "&#9650;" :
    data.qualityTrend === "down" ? "&#9660;" :
    "&#9644;";

  const trendColor =
    data.qualityTrend === "up" ? "text-emerald-600" :
    data.qualityTrend === "down" ? "text-red-500" :
    "text-slate-500";

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Insights" description="Analise de qualidade e recomendacoes" />

      {/* Top cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Quality Score */}
        <div className="bg-white border rounded-lg p-5 flex flex-col items-center justify-center">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Score de Qualidade</p>
          <p className={`text-4xl font-bold ${scoreColor}`}>
            {data.averageQualityScore ?? "—"}
          </p>
          <div className="flex items-center gap-1 mt-2">
            <span className={`text-sm ${trendColor}`} dangerouslySetInnerHTML={{ __html: trendIcon }} />
            <span className={`text-xs ${trendColor}`}>
              {data.qualityTrend === "up" ? "Subindo" : data.qualityTrend === "down" ? "Caindo" : "Estavel"}
            </span>
          </div>
        </div>

        {/* Best Format */}
        <div className="bg-white border rounded-lg p-5 flex flex-col items-center justify-center">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Melhor Formato</p>
          <p className="text-lg font-bold text-slate-900">{data.bestPerformingFormat ?? "—"}</p>
          <p className="text-xs text-slate-500 mt-1">Formato com melhor desempenho</p>
        </div>

        {/* Jobs Processed */}
        <KPICard label="Jobs Processados" value={data.jobsProcessed} icon="&#9881;" />
      </div>

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div className="bg-white border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Recomendacoes</h2>
          <ul className="space-y-2">
            {data.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg">
                <span className="text-blue-500 mt-0.5">&#128161;</span>
                <p className="text-sm text-slate-700">{rec}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
