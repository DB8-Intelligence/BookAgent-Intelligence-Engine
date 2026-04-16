"use client";

import { useEffect, useState, useCallback } from "react";
import { bookagent, type DashboardCampaigns } from "@/lib/bookagentApi";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { KPICard } from "@/components/dashboard/KPICard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { EmptyState } from "@/components/dashboard/EmptyState";

export default function CampaignsPage() {
  const [data, setData] = useState<DashboardCampaigns | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await bookagent.dashboard.campaigns();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar campanhas");
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
      <PageHeader title="Campanhas" description="Gerencie suas campanhas de conteudo" />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <KPICard label="Total de campanhas" value={data.total} icon="📋" />
        <KPICard label="Ativas" value={data.active} icon="🟢" />
      </div>

      {/* Campaigns List */}
      {data.campaigns.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="Nenhuma campanha encontrada"
          description="Crie sua primeira campanha para organizar e agendar publicacoes."
        />
      ) : (
        <div className="space-y-3">
          {data.campaigns.map((campaign) => (
            <div key={campaign.id} className="bg-white border rounded-lg p-4 hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{campaign.name}</h3>
                    <StatusBadge status={campaign.status} />
                  </div>
                  {campaign.goal && (
                    <p className="text-xs text-slate-500">{campaign.goal}</p>
                  )}
                </div>
                <span className="text-xs text-slate-400">
                  {new Date(campaign.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </div>

              <div className="flex items-center gap-4 mt-3 pt-3 border-t">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500">Itens:</span>
                  <span className="text-xs font-medium text-slate-700">{campaign.itemsCount}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500">Publicados:</span>
                  <span className="text-xs font-medium text-slate-700">{campaign.publishedCount}</span>
                </div>
                {campaign.itemsCount > 0 && (
                  <div className="flex-1">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${Math.min((campaign.publishedCount / campaign.itemsCount) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
