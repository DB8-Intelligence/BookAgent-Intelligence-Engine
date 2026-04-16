"use client";

import { useEffect, useState, useCallback } from "react";
import { bookagent, type DashboardBilling } from "@/lib/bookagentApi";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { KPICard } from "@/components/dashboard/KPICard";
import { EmptyState } from "@/components/dashboard/EmptyState";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function BillingPage() {
  const [data, setData] = useState<DashboardBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await bookagent.dashboard.billing();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar informacoes de cobranca");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">Carregando...</div>;
  if (error) return <div className="p-4 bg-red-50 text-red-600 rounded-lg">{error}</div>;
  if (!data) return null;

  const statusColor =
    data.subscriptionStatus === "active" ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
    data.subscriptionStatus === "trialing" ? "text-blue-600 bg-blue-50 border-blue-200" :
    data.subscriptionStatus === "past_due" ? "text-red-600 bg-red-50 border-red-200" :
    "text-slate-600 bg-slate-50 border-slate-200";

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Plano e Cobranca" description="Gerencie sua assinatura e pagamentos" />

      {/* Current Plan Card */}
      <div className="bg-white border rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{data.planName}</h2>
            <p className="text-2xl font-bold text-slate-900 mt-1">{formatBRL(data.priceMonthlyBRL)}<span className="text-sm font-normal text-slate-500">/mes</span></p>
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${statusColor}`}>
            {data.subscriptionStatus === "active" ? "Ativo" :
             data.subscriptionStatus === "trialing" ? "Trial" :
             data.subscriptionStatus === "past_due" ? "Pagamento pendente" :
             data.subscriptionStatus}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t">
          <div>
            <p className="text-xs text-slate-500">Proxima cobranca</p>
            <p className="text-sm font-medium text-slate-700">
              {data.nextBillingAt
                ? new Date(data.nextBillingAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Ultimo pagamento</p>
            <p className="text-sm font-medium text-slate-700">
              {data.lastPaymentAt
                ? new Date(data.lastPaymentAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
                : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Trial Info */}
      {data.trial.active && (
        <div className={`border rounded-lg p-4 mb-6 ${
          (data.trial.daysRemaining ?? 0) <= 3
            ? "bg-red-50 border-red-200"
            : (data.trial.daysRemaining ?? 0) <= 7
            ? "bg-amber-50 border-amber-200"
            : "bg-blue-50 border-blue-200"
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`text-sm font-semibold ${
                (data.trial.daysRemaining ?? 0) <= 3 ? "text-red-800" :
                (data.trial.daysRemaining ?? 0) <= 7 ? "text-amber-800" :
                "text-blue-800"
              }`}>
                Periodo de teste
              </h3>
              <p className={`text-xs mt-0.5 ${
                (data.trial.daysRemaining ?? 0) <= 3 ? "text-red-600" :
                (data.trial.daysRemaining ?? 0) <= 7 ? "text-amber-600" :
                "text-blue-600"
              }`}>
                {data.trial.endsAt
                  ? `Expira em ${new Date(data.trial.endsAt).toLocaleDateString("pt-BR")}`
                  : "Ativo"}
              </p>
            </div>
            <div className={`text-2xl font-bold ${
              (data.trial.daysRemaining ?? 0) <= 3 ? "text-red-700" :
              (data.trial.daysRemaining ?? 0) <= 7 ? "text-amber-700" :
              "text-blue-700"
            }`}>
              {data.trial.daysRemaining ?? 0}
              <span className="text-xs font-normal ml-1">dias restantes</span>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Options */}
      {data.upgradeOptions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Opcoes de upgrade</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.upgradeOptions.map((plan) => (
              <div key={plan.planTier} className="bg-white border rounded-lg p-5 flex flex-col">
                <h3 className="text-base font-bold text-slate-900">{plan.planName}</h3>
                <p className="text-xl font-bold text-slate-900 mt-2">
                  {formatBRL(plan.priceMonthlyBRL)}
                  <span className="text-xs font-normal text-slate-500">/mes</span>
                </p>

                <ul className="mt-4 space-y-2 flex-1">
                  {plan.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                      <span className="text-emerald-500 mt-0.5">&#10003;</span>
                      {h}
                    </li>
                  ))}
                </ul>

                <button
                  disabled
                  className="mt-4 w-full px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-md opacity-60 cursor-not-allowed"
                >
                  Fazer upgrade
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
