"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  bookagent,
  type DashboardJobDetail,
  type DashboardArtifact,
  type DashboardReview,
  type DashboardPublication,
  formatBytes,
  ARTIFACT_ICONS,
} from "@/lib/bookagentApi";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { KPICard } from "@/components/dashboard/KPICard";
import { Button } from "@/components/ui/button";
import { extractMaterialName } from "@/lib/materialName";

type ActionState = { loading: boolean; success: string | null; error: string | null };

const initialActionState: ActionState = { loading: false, success: null, error: null };

export default function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;

  const [data, setData] = useState<DashboardJobDetail | null>(null);
  const [materialName, setMaterialName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action states
  const [approveState, setApproveState] = useState<ActionState>(initialActionState);
  const [rejectState, setRejectState] = useState<ActionState>(initialActionState);
  const [publishState, setPublishState] = useState<ActionState>(initialActionState);
  const [rejectComment, setRejectComment] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch dashboard detail + material name in parallel
      const [detail, job] = await Promise.all([
        bookagent.dashboard.jobDetail(jobId),
        bookagent.jobs.get(jobId).catch(() => null),
      ]);
      setData(detail);
      setMaterialName(extractMaterialName(job?.input?.file_url));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar detalhes do job");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  // -- Action handlers --

  const handleApprove = async () => {
    try {
      setApproveState({ loading: true, success: null, error: null });
      await bookagent.dashboard.approve(jobId, {
        userId: "dashboard-user",
        approvalType: "final",
      });
      setApproveState({ loading: false, success: "Job aprovado com sucesso!", error: null });
      load();
    } catch (err) {
      setApproveState({
        loading: false,
        success: null,
        error: err instanceof Error ? err.message : "Erro ao aprovar",
      });
    }
  };

  const handleReject = async () => {
    if (!rejectComment.trim()) return;
    try {
      setRejectState({ loading: true, success: null, error: null });
      await bookagent.dashboard.reject(jobId, {
        userId: "dashboard-user",
        comment: rejectComment.trim(),
        approvalType: "final",
      });
      setRejectState({ loading: false, success: "Job reprovado.", error: null });
      setShowRejectForm(false);
      setRejectComment("");
      load();
    } catch (err) {
      setRejectState({
        loading: false,
        success: null,
        error: err instanceof Error ? err.message : "Erro ao reprovar",
      });
    }
  };

  const handlePublish = async () => {
    try {
      setPublishState({ loading: true, success: null, error: null });
      await bookagent.dashboard.publish(jobId, { userId: "dashboard-user" });
      setPublishState({ loading: false, success: "Publicacao iniciada!", error: null });
      load();
    } catch (err) {
      setPublishState({
        loading: false,
        success: null,
        error: err instanceof Error ? err.message : "Erro ao publicar",
      });
    }
  };

  // -- Render --

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
        <Link href="/dashboard/jobs" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
          &larr; Voltar para Jobs
        </Link>
        <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-200">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const canApprove = data.status === "AWAITING_REVIEW" || data.status === "REVISION_IN_PROGRESS";
  const canReject = data.status === "AWAITING_REVIEW" || data.status === "REVISION_IN_PROGRESS";
  const canPublish = data.status === "APPROVED";

  // Pipeline finished = artifacts exist and job has completedAt timestamp.
  // Show "Ver Produtos" CTA regardless of review/approval status.
  const pipelineFinished = Boolean(data.pipeline?.completedAt) || data.artifacts.length > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Back link */}
      <Link href="/dashboard/jobs" className="text-sm text-blue-600 hover:underline inline-block">
        &larr; Voltar para Jobs
      </Link>

      {/* Header */}
      <PageHeader
        title={materialName || `Job ${data.jobId.slice(0, 8)}`}
        description={data.inputType ? `${data.inputType.toUpperCase()} • ${data.jobId.slice(0, 8)}` : undefined}
        action={
          <div className="flex items-center gap-3">
            {pipelineFinished && (
              <Link href={`/outputs/${data.jobId}`}>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                  Ver Produtos Gerados →
                </Button>
              </Link>
            )}
            <StatusBadge status={data.status} className="text-sm px-3 py-1" />
          </div>
        }
      />

      {/* Pipeline section */}
      <Section title="Pipeline">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard
            label="Iniciado em"
            value={new Date(data.pipeline.startedAt).toLocaleString("pt-BR")}
            icon="🚀"
          />
          <KPICard
            label="Concluido em"
            value={data.pipeline.completedAt ? new Date(data.pipeline.completedAt).toLocaleString("pt-BR") : "--"}
            icon="🏁"
          />
          <KPICard
            label="Duracao"
            value={data.pipeline.durationMs != null ? formatDuration(data.pipeline.durationMs) : "--"}
            icon="⏱️"
          />
          <KPICard
            label="Estagio atual"
            value={data.pipeline.currentStage ?? "Finalizado"}
            icon="📍"
          />
        </div>
      </Section>

      {/* Approval section */}
      <Section title="Aprovacao">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Status</p>
            <p className="text-sm font-medium text-slate-900">{data.approval.status ?? "--"}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Rodada</p>
            <p className="text-sm font-medium text-slate-900">{data.approval.round}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Ultimo comentario</p>
            <p className="text-sm text-slate-700">{data.approval.latestComment ?? "--"}</p>
          </div>
        </div>

        {/* Action buttons */}
        {(canApprove || canReject || canPublish) && (
          <div className="flex flex-wrap items-start gap-3">
            {canApprove && (
              <button
                onClick={handleApprove}
                disabled={approveState.loading}
                className="px-4 py-2 text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {approveState.loading ? "Aprovando..." : "Aprovar"}
              </button>
            )}

            {canReject && !showRejectForm && (
              <button
                onClick={() => setShowRejectForm(true)}
                className="px-4 py-2 text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                Reprovar
              </button>
            )}

            {canPublish && (
              <button
                onClick={handlePublish}
                disabled={publishState.loading}
                className="px-4 py-2 text-sm font-medium rounded-md text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {publishState.loading ? "Publicando..." : "Publicar"}
              </button>
            )}
          </div>
        )}

        {/* Reject form */}
        {showRejectForm && (
          <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded-lg space-y-3">
            <textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder="Motivo da reprovacao..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-red-200 rounded-md bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-300"
            />
            <div className="flex gap-2">
              <button
                onClick={handleReject}
                disabled={rejectState.loading || !rejectComment.trim()}
                className="px-4 py-2 text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {rejectState.loading ? "Enviando..." : "Confirmar reprovacao"}
              </button>
              <button
                onClick={() => { setShowRejectForm(false); setRejectComment(""); }}
                className="px-4 py-2 text-sm font-medium rounded-md text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Action feedback */}
        <ActionFeedback state={approveState} />
        <ActionFeedback state={rejectState} />
        <ActionFeedback state={publishState} />
      </Section>

      {/* Artifacts section */}
      <Section title={`Artifacts (${data.artifacts.length})`}>
        {data.artifacts.length === 0 ? (
          <EmptyState icon="🎨" title="Nenhum artifact gerado" description="Os artifacts serao exibidos aqui apos o processamento." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.artifacts.map((artifact) => (
              <ArtifactCard key={artifact.id} artifact={artifact} />
            ))}
          </div>
        )}
      </Section>

      {/* Reviews section */}
      <Section title={`Revisoes (${data.reviews.length})`}>
        {data.reviews.length === 0 ? (
          <EmptyState icon="📝" title="Nenhuma revisao" description="As revisoes aparecerrao aqui." />
        ) : (
          <div className="divide-y border rounded-lg bg-white">
            {data.reviews.map((review) => (
              <ReviewRow key={review.id} review={review} />
            ))}
          </div>
        )}
      </Section>

      {/* Publications section */}
      <Section title={`Publicacoes (${data.publications.length})`}>
        {data.publications.length === 0 ? (
          <EmptyState icon="📢" title="Nenhuma publicacao" description="As publicacoes aparecerrao aqui apos a aprovacao." />
        ) : (
          <div className="divide-y border rounded-lg bg-white">
            {data.publications.map((pub) => (
              <PublicationRow key={pub.id} publication={pub} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-lg p-5">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function ArtifactCard({ artifact }: { artifact: DashboardArtifact }) {
  const icon = ARTIFACT_ICONS[artifact.type] ?? "📄";

  return (
    <div className="border rounded-lg p-4 hover:border-slate-300 transition-colors">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{artifact.title}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-500">{artifact.format}</span>
            {artifact.sizeBytes != null && (
              <>
                <span className="text-xs text-slate-300">|</span>
                <span className="text-xs text-slate-500">{formatBytes(artifact.sizeBytes)}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <StatusBadge status={artifact.status} />
          </div>
          <div className="flex items-center gap-2 mt-3">
            {artifact.downloadUrl && (
              <a
                href={artifact.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                Download
              </a>
            )}
            {artifact.previewUrl && (
              <a
                href={artifact.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                Preview
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ review }: { review: DashboardReview }) {
  const decisionColors: Record<string, string> = {
    approved: "text-emerald-700 bg-emerald-50",
    rejected: "text-red-700 bg-red-50",
    comment: "text-blue-700 bg-blue-50",
  };
  const colorClass = decisionColors[review.decision] ?? "text-slate-700 bg-slate-50";

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3 mb-1">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
          {review.decision}
        </span>
        <span className="text-xs text-slate-400">{review.channel}</span>
        <span className="text-xs text-slate-400">
          {new Date(review.createdAt).toLocaleString("pt-BR")}
        </span>
      </div>
      {review.comment && (
        <p className="text-sm text-slate-700 mt-1">{review.comment}</p>
      )}
    </div>
  );
}

function PublicationRow({ publication }: { publication: DashboardPublication }) {
  const statusColors: Record<string, string> = {
    published: "text-emerald-700 bg-emerald-50",
    failed: "text-red-700 bg-red-50",
    pending: "text-amber-700 bg-amber-50",
    queued: "text-slate-700 bg-slate-50",
  };
  const colorClass = statusColors[publication.status] ?? "text-slate-700 bg-slate-50";

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-900">{publication.platform}</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
            {publication.status}
          </span>
          {publication.platformPostId && (
            <span className="text-xs text-slate-400 font-mono">ID: {publication.platformPostId}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            Tentativas: {publication.attempts}
          </span>
          {publication.publishedAt && (
            <span className="text-xs text-slate-500">
              {new Date(publication.publishedAt).toLocaleString("pt-BR")}
            </span>
          )}
        </div>
      </div>
      {publication.postUrl && (
        <a
          href={publication.postUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:underline mt-1 inline-block"
        >
          {publication.postUrl}
        </a>
      )}
      {publication.error && (
        <p className="text-xs text-red-600 mt-1">{publication.error}</p>
      )}
    </div>
  );
}

function ActionFeedback({ state }: { state: ActionState }) {
  if (!state.success && !state.error) return null;
  return (
    <div className={`mt-2 px-3 py-2 rounded-md text-sm ${
      state.success ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
    }`}>
      {state.success ?? state.error}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}min ${remSecs}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}min`;
}
