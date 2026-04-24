"use client";

/**
 * CreditsCard — saldo de créditos prominente no dashboard.
 *
 * Mostra jobs e renders restantes no período, barra de progresso colorida
 * por nível de uso (verde <70%, âmbar 70-90%, vermelho >90%) e link pro
 * upgrade quando bater limite.
 */

import Link from "next/link";

interface CreditsCardProps {
  planTier: string;
  jobsUsed: number;
  jobsLimit: number;
  jobsPercent: number;
  rendersUsed: number;
  rendersLimit: number;
  rendersPercent: number;
}

export function CreditsCard({
  planTier,
  jobsUsed,
  jobsLimit,
  jobsPercent,
  rendersUsed,
  rendersLimit,
  rendersPercent,
}: CreditsCardProps) {
  const jobsRemaining = Math.max(jobsLimit - jobsUsed, 0);
  const rendersRemaining = Math.max(rendersLimit - rendersUsed, 0);
  const lowBalance = jobsPercent > 80 || rendersPercent > 80;

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl p-5 mb-6 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-400">
            Saldo de créditos · Plano {planTier.toUpperCase()}
          </p>
          <h2 className="text-2xl font-semibold mt-1">
            {jobsRemaining} jobs · {rendersRemaining} renders
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">restantes neste mês</p>
        </div>
        {lowBalance && (
          <Link
            href="/dashboard/billing"
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-amber-500 text-slate-900 hover:bg-amber-400"
          >
            Fazer upgrade
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CreditMeter
          label="Jobs"
          used={jobsUsed}
          limit={jobsLimit}
          percent={jobsPercent}
        />
        <CreditMeter
          label="Renders de vídeo"
          used={rendersUsed}
          limit={rendersLimit}
          percent={rendersPercent}
        />
      </div>
    </div>
  );
}

function CreditMeter({
  label,
  used,
  limit,
  percent,
}: {
  label: string;
  used: number;
  limit: number;
  percent: number;
}) {
  const barColor =
    percent > 90 ? "bg-red-500" : percent > 70 ? "bg-amber-400" : "bg-emerald-400";

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5">
        <span>{label}</span>
        <span>
          {used} / {limit}
        </span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}
