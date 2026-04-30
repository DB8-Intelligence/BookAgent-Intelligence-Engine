"use client";

/**
 * LiveJobStatus — mostra status em tempo real de um job específico via SSE.
 *
 * Conecta no endpoint /api/v1/jobs/:jobId/events usando o hook useJobEvents.
 * Renderiza: label amigável do stage + barra de progresso + ícone animado.
 */

import Link from "next/link";
import { useJobEvents, stageLabel } from "@/hooks/useJobEvents";

interface LiveJobStatusProps {
  jobId: string;
  /** Texto curto identificando o job (ex: nome do material ou jobId truncado) */
  jobLabel?: string;
}

export function LiveJobStatus({ jobId, jobLabel }: LiveJobStatusProps) {
  const { status, stage, progress, error } = useJobEvents(jobId);

  const pulseClass =
    status === "processing" ? "animate-pulse bg-blue-500" :
    status === "completed" ? "bg-emerald-500" :
    status === "failed" ? "bg-red-500" :
    "bg-slate-400";

  const headline =
    status === "completed" ? "Pronto!" :
    status === "failed" ? "Falhou" :
    status === "error" ? "Erro na conexão" :
    status === "connecting" ? "Conectando…" :
    `Sua IA está ${stageLabel(stage).toLowerCase()}…`;

  return (
    <div className="bg-white border rounded-lg p-4 flex items-center gap-4">
      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${pulseClass}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-slate-900 truncate">
            {headline}
          </p>
          {jobLabel && (
            <p className="text-xs text-slate-400 truncate">{jobLabel}</p>
          )}
        </div>

        {status === "processing" && (
          <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {error && (
          <p className="text-xs text-red-600 mt-1 truncate">{error}</p>
        )}
      </div>

      <Link
        href={`/dashboard/jobs/${jobId}`}
        className="text-xs text-blue-600 hover:underline shrink-0"
      >
        Abrir →
      </Link>
    </div>
  );
}
