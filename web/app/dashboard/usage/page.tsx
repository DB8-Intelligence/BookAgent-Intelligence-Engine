"use client";

import { useEffect, useState, useCallback } from "react";
import { bookagent, type DashboardUsage } from "@/lib/bookagentApi";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";

export default function UsagePage() {
  const [data, setData] = useState<DashboardUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await bookagent.dashboard.usage();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar uso do plano");
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
        title="Uso do Plano"
        description={`Periodo: ${data.period}`}
        action={
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-900 text-white">
            {data.planTier.toUpperCase()}
          </span>
        }
      />

      {/* Feature Usage Cards */}
      {data.features.length === 0 ? (
        <EmptyState
          icon="📊"
          title="Nenhum recurso disponivel"
          description="Informacoes de uso aparecerao aqui quando houver consumo."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {data.features.map((feature) => {
            const statusColor =
              feature.status === "ok" ? "bg-emerald-500" :
              feature.status === "warning" ? "bg-amber-500" :
              feature.status === "blocked" ? "bg-red-500" :
              "bg-slate-300";

            const statusLabel =
              feature.status === "ok" ? "Normal" :
              feature.status === "warning" ? "Atenção" :
              feature.status === "blocked" ? "Bloqueado" :
              "Desabilitado";

            const barColor =
              feature.status === "ok" ? "bg-emerald-500" :
              feature.status === "warning" ? "bg-amber-500" :
              feature.status === "blocked" ? "bg-red-500" :
              "bg-slate-300";

            return (
              <div key={feature.label} className="bg-white border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-900">{feature.label}</h3>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${statusColor}`} />
                    <span className="text-xs text-slate-500">{statusLabel}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${Math.min(feature.percent, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{feature.used} / {feature.limit} usados</span>
                    <span>{feature.remaining} restantes ({feature.percent}%)</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Alertas</h2>
          <div className="space-y-2">
            {data.alerts.map((alert, i) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-amber-50 rounded-lg border border-amber-200">
                <span className="text-amber-500 text-sm">&#9888;</span>
                <p className="text-xs text-amber-800">{alert}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
