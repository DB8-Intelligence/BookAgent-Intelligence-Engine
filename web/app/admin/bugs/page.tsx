"use client";

/**
 * Admin Bug Reports — Triage page for bug reports.
 *
 * Shows all reports with severity/status filters,
 * expandable detail cards with API request timeline,
 * and inline triage buttons.
 */

import { useEffect, useState } from "react";
import { bookagent } from "@/lib/bookagentApi";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BugReport {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  severity: string;
  status: string;
  context: {
    url?: string;
    route?: string;
    user_agent?: string;
    viewport?: { width: number; height: number };
    api_log?: Array<{
      method: string;
      path: string;
      status: number;
      error?: string;
      timestamp: string;
      duration_ms: number;
    }>;
    timestamp?: string;
  };
  admin_notes?: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SEVERITY_BADGE: Record<string, { label: string; class: string }> = {
  blocker: { label: "Bloqueante", class: "bg-red-100 text-red-700 border-red-300" },
  bug: { label: "Bug", class: "bg-amber-100 text-amber-700 border-amber-300" },
  suggestion: { label: "Sugestao", class: "bg-blue-100 text-blue-700 border-blue-300" },
};

const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  new: { label: "Novo", class: "bg-purple-100 text-purple-700 border-purple-300" },
  investigating: { label: "Investigando", class: "bg-amber-100 text-amber-700 border-amber-300" },
  fixed: { label: "Corrigido", class: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  wont_fix: { label: "Nao corrigir", class: "bg-zinc-100 text-zinc-600 border-zinc-300" },
};

const STATUSES = ["new", "investigating", "fixed", "wont_fix"] as const;
const SEVERITIES = ["blocker", "bug", "suggestion"] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminBugsPage() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [triaging, setTriaging] = useState<string | null>(null);

  useEffect(() => {
    loadReports();
  }, [filterSeverity, filterStatus]);

  async function loadReports() {
    setLoading(true);
    try {
      const data = await bookagent.bugs.list({
        severity: filterSeverity ?? undefined,
        status: filterStatus ?? undefined,
      });
      setReports(data as unknown as BugReport[]);
      setForbidden(false);
    } catch (err) {
      if (err instanceof Error && err.message.includes("403")) {
        setForbidden(true);
      }
      setReports([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleTriage(id: string, status: string) {
    setTriaging(id);
    try {
      await bookagent.bugs.triage(id, { status });
      setReports((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r)),
      );
    } catch {
      // ignore
    } finally {
      setTriaging(null);
    }
  }

  if (forbidden) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <span className="text-4xl block mb-4">🔒</span>
        <h1 className="text-xl font-bold mb-2">Pagina restrita</h1>
        <p className="text-muted-foreground">Apenas administradores podem acessar esta pagina.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Bug Reports</h1>
        <p className="text-sm text-muted-foreground">{reports.length} reports</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Severidade</p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={filterSeverity === null ? "default" : "outline"}
              className="text-xs h-7"
              onClick={() => setFilterSeverity(null)}
            >
              Todos
            </Button>
            {SEVERITIES.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={filterSeverity === s ? "default" : "outline"}
                className="text-xs h-7"
                onClick={() => setFilterSeverity(filterSeverity === s ? null : s)}
              >
                {SEVERITY_BADGE[s]?.label ?? s}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Status</p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={filterStatus === null ? "default" : "outline"}
              className="text-xs h-7"
              onClick={() => setFilterStatus(null)}
            >
              Todos
            </Button>
            {STATUSES.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={filterStatus === s ? "default" : "outline"}
                className="text-xs h-7"
                onClick={() => setFilterStatus(filterStatus === s ? null : s)}
              >
                {STATUS_BADGE[s]?.label ?? s}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Carregando...
          </CardContent>
        </Card>
      )}

      {/* Reports */}
      {!loading && reports.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum report encontrado
          </CardContent>
        </Card>
      )}

      {!loading && reports.map((report) => {
        const isExpanded = expanded === report.id;
        const ctx = report.context;

        return (
          <Card
            key={report.id}
            className="overflow-hidden cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => setExpanded(isExpanded ? null : report.id)}
          >
            <CardContent className="p-4 space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm truncate">{report.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(report.created_at).toLocaleString("pt-BR")}
                    {ctx.route ? ` — ${ctx.route}` : ""}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Badge variant="outline" className={cn("text-[10px]", SEVERITY_BADGE[report.severity]?.class)}>
                    {SEVERITY_BADGE[report.severity]?.label ?? report.severity}
                  </Badge>
                  <Badge variant="outline" className={cn("text-[10px]", STATUS_BADGE[report.status]?.class)}>
                    {STATUS_BADGE[report.status]?.label ?? report.status}
                  </Badge>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="space-y-3 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                  {/* Description */}
                  {report.description && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Descricao</p>
                      <p className="text-sm whitespace-pre-wrap bg-muted rounded p-2">{report.description}</p>
                    </div>
                  )}

                  {/* Context */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {ctx.url && (
                      <div>
                        <span className="text-muted-foreground">URL:</span>{" "}
                        <span className="break-all">{ctx.url}</span>
                      </div>
                    )}
                    {ctx.viewport && (
                      <div>
                        <span className="text-muted-foreground">Viewport:</span>{" "}
                        {ctx.viewport.width}x{ctx.viewport.height}
                      </div>
                    )}
                    {ctx.user_agent && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">UA:</span>{" "}
                        <span className="truncate block">{ctx.user_agent}</span>
                      </div>
                    )}
                  </div>

                  {/* API Timeline */}
                  {ctx.api_log && ctx.api_log.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Ultimas requisicoes ({ctx.api_log.length})
                      </p>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {ctx.api_log.map((entry, i) => {
                          const isError = entry.status >= 400 || entry.status === 0;
                          return (
                            <div
                              key={i}
                              className={cn(
                                "flex items-center gap-2 text-[11px] font-mono rounded px-2 py-1",
                                isError ? "bg-red-50 text-red-700" : "bg-muted",
                              )}
                            >
                              <span className="font-bold w-10">{entry.method}</span>
                              <span className="flex-1 truncate">{entry.path}</span>
                              <span className={cn("w-8 text-right", isError && "font-bold")}>
                                {entry.status || "ERR"}
                              </span>
                              <span className="text-muted-foreground w-12 text-right">
                                {entry.duration_ms}ms
                              </span>
                              {entry.error && (
                                <span className="text-red-500 truncate max-w-32" title={entry.error}>
                                  {entry.error}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Triage buttons */}
                  <div className="flex gap-2 pt-2 border-t">
                    {STATUSES.map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={report.status === s ? "default" : "outline"}
                        className="text-xs h-7"
                        disabled={triaging === report.id || report.status === s}
                        onClick={() => handleTriage(report.id, s)}
                      >
                        {STATUS_BADGE[s]?.label ?? s}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
