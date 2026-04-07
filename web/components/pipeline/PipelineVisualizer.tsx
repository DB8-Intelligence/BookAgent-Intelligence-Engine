"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  bookagent,
  PIPELINE_STAGES,
  JOB_STATUS_CONFIG,
  type JobDetail,
  type SourceItem,
  type PlanItem,
} from "@/lib/bookagentApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PipelineVisualizerProps {
  jobId: string;
  /** Polling interval in ms (default 3000). Set 0 to disable polling. */
  pollInterval?: number;
  /** Callback when job completes */
  onComplete?: (job: JobDetail) => void;
  /** Callback when job fails */
  onFail?: (job: JobDetail) => void;
}

// ---------------------------------------------------------------------------
// Stage state (simulated from job status)
// ---------------------------------------------------------------------------

type StageState = "pending" | "running" | "done" | "error";

function getStageStates(job: JobDetail | null): StageState[] {
  if (!job) return PIPELINE_STAGES.map(() => "pending");

  if (job.status === "completed") return PIPELINE_STAGES.map(() => "done");
  if (job.status === "failed") {
    // Mark some as done, last as error, rest as pending
    const errorAt = Math.floor(Math.random() * 10) + 3; // simulated
    return PIPELINE_STAGES.map((_, i) =>
      i < errorAt ? "done" : i === errorAt ? "error" : "pending",
    );
  }
  if (job.status === "processing") {
    // Estimate progress from elapsed time (heuristic)
    const elapsed = Date.now() - new Date(job.created_at).getTime();
    const estimatedStages = Math.min(
      PIPELINE_STAGES.length - 1,
      Math.floor(elapsed / 4000), // ~4s per stage estimate
    );
    return PIPELINE_STAGES.map((_, i) =>
      i < estimatedStages ? "done" : i === estimatedStages ? "running" : "pending",
    );
  }

  return PIPELINE_STAGES.map(() => "pending");
}

function getProgressPercent(states: StageState[]): number {
  const done = states.filter((s) => s === "done").length;
  return Math.round((done / states.length) * 100);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PipelineVisualizer({
  jobId,
  pollInterval = 3000,
  onComplete,
  onFail,
}: PipelineVisualizerProps) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stageStates, setStageStates] = useState<StageState[]>(
    PIPELINE_STAGES.map(() => "pending"),
  );

  const fetchJob = useCallback(async () => {
    try {
      const j = await bookagent.jobs.get(jobId);
      setJob(j);
      setStageStates(getStageStates(j));

      if (j.status === "completed") {
        onComplete?.(j);
        if (j.has_result) {
          const [s, p] = await Promise.all([
            bookagent.jobs.sources(jobId).catch(() => []),
            bookagent.jobs.plans(jobId).catch(() => []),
          ]);
          setSources(s);
          setPlans(p);
        }
      } else if (j.status === "failed") {
        onFail?.(j);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar job");
    }
  }, [jobId, onComplete, onFail]);

  // Initial fetch
  useEffect(() => { fetchJob(); }, [fetchJob]);

  // Polling
  useEffect(() => {
    if (!pollInterval || job?.status === "completed" || job?.status === "failed") return;
    const id = setInterval(fetchJob, pollInterval);
    return () => clearInterval(id);
  }, [pollInterval, fetchJob, job?.status]);

  const progress = getProgressPercent(stageStates);
  const isActive = job?.status === "processing" || job?.status === "pending";
  const isDone = job?.status === "completed";
  const isFailed = job?.status === "failed";
  const statusCfg = job ? JOB_STATUS_CONFIG[job.status] : null;

  // -- Error state --
  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchJob}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  // -- Loading --
  if (!job) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Carregando pipeline...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">Pipeline</h2>
            {statusCfg && (
              <Badge variant="outline" className={statusCfg.bg}>{statusCfg.label}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{jobId}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{job.input.type.toUpperCase()}</span>
          <span>&middot;</span>
          <span>{new Date(job.created_at).toLocaleString("pt-BR")}</span>
        </div>
      </div>

      {/* ── Progress bar ──────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">
            {isActive ? "Processando..." : isDone ? "Concluido" : isFailed ? "Falhou" : "Aguardando"}
          </span>
          <span className="text-xs font-medium">{progress}%</span>
        </div>
        <Progress value={isDone ? 100 : progress} className={cn("h-2", isActive && "animate-pulse")} />
      </div>

      {/* ── Stage grid ────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            17 Etapas do Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {PIPELINE_STAGES.map((stage, i) => {
              const state = stageStates[i];
              return (
                <div
                  key={stage.id}
                  className={cn(
                    "relative rounded-lg border p-3 transition-all",
                    state === "done" && "border-emerald-500/30 bg-emerald-500/5",
                    state === "running" && "border-amber-500/40 bg-amber-500/5 ring-1 ring-amber-500/30",
                    state === "error" && "border-red-500/30 bg-red-500/5",
                    state === "pending" && "border-border bg-muted/30 opacity-50",
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-base">{stage.icon}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{stage.id}</span>
                  </div>
                  <p className="text-[11px] font-medium leading-tight">{stage.name}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">{stage.desc}</p>

                  {/* Status dot */}
                  <div className="absolute top-2 right-2">
                    {state === "done" && <span className="block w-2 h-2 rounded-full bg-emerald-500" />}
                    {state === "running" && <span className="block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
                    {state === "error" && <span className="block w-2 h-2 rounded-full bg-red-500" />}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Error detail ──────────────────────────── */}
      {isFailed && job.error && (
        <Card className="border-destructive/50">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-destructive mb-1">Falha no processamento</p>
            <p className="text-xs text-muted-foreground">{job.error}</p>
          </CardContent>
        </Card>
      )}

      {/* ── KPI summary ───────────────────────────── */}
      {isDone && job.output_summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {([
            { label: "Sources", value: job.output_summary.source_count, icon: "📋" },
            { label: "Media Plans", value: job.output_summary.media_plans, icon: "🎬" },
            { label: "Blog Plans", value: job.output_summary.blog_plans, icon: "✍️" },
            { label: "Landing Pages", value: job.output_summary.landing_page_plans, icon: "🌐" },
            { label: "Selecionados", value: job.output_summary.selected_outputs, icon: "✅" },
            { label: "Artefatos", value: job.output_summary.artifacts, icon: "📦" },
          ] as const).map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-3 text-center">
                <span className="text-xl">{kpi.icon}</span>
                <p className="text-xl font-bold mt-1">{kpi.value}</p>
                <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Sources ───────────────────────────────── */}
      {sources.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sources Extraidas ({sources.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {sources.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{s.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-[9px] h-4">{s.type}</Badge>
                      {s.narrative_role && (
                        <Badge variant="outline" className="text-[9px] h-4">{s.narrative_role}</Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {s.asset_count} asset(s) &middot; {Math.round(s.confidence_score * 100)}%
                      </span>
                    </div>
                    {s.summary && (
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{s.summary}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-[10px] ml-3 shrink-0">P{s.priority}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Plans ─────────────────────────────────── */}
      {plans.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Planos Gerados ({plans.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-2">
              {plans.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/40">
                  <div>
                    <p className="text-sm font-medium">{p.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-[9px] h-4">{p.plan_type}</Badge>
                      <span className="text-[10px] text-muted-foreground">{p.format}</span>
                      {p.confidence != null && (
                        <span className="text-[10px] text-muted-foreground">
                          {Math.round(p.confidence * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                  {p.status && (
                    <Badge variant="outline" className={cn(
                      "text-[9px]",
                      p.status === "ready" && "text-emerald-500 border-emerald-500/30",
                      p.status === "partial" && "text-amber-500 border-amber-500/30",
                    )}>
                      {p.status}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── CTA ───────────────────────────────────── */}
      {isDone && job.output_summary && job.output_summary.artifacts > 0 && (
        <div className="text-center pt-2">
          <Link href={`/outputs/${jobId}`}>
            <Button size="lg">
              Ver {job.output_summary.artifacts} Artefato(s)
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
