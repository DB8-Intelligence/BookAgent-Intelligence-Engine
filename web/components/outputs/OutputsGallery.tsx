"use client";

import { useEffect, useState, useMemo } from "react";
import {
  bookagent,
  formatBytes,
  ARTIFACT_ICONS,
  FORMAT_LABELS,
  type ArtifactListItem,
  type ArtifactDetail,
  type ArtifactType,
} from "@/lib/bookagentApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OutputsGalleryProps {
  jobId: string;
  /** Initial filter by artifact type */
  filterType?: ArtifactType;
}

// ---------------------------------------------------------------------------
// Filter bar types
// ---------------------------------------------------------------------------

type FilterKey = "all" | ArtifactType;

const FILTER_OPTIONS: { key: FilterKey; label: string; icon: string }[] = [
  { key: "all", label: "Todos", icon: "📁" },
  { key: "media-render-spec", label: "Media", icon: "🎬" },
  { key: "blog-article", label: "Blog", icon: "✍️" },
  { key: "landing-page", label: "Landing Page", icon: "🌐" },
  { key: "media-metadata", label: "Metadata", icon: "📋" },
];

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  valid: "text-emerald-500 border-emerald-500/30",
  partial: "text-amber-500 border-amber-500/30",
  invalid: "text-red-500 border-red-500/30",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OutputsGallery({ jobId, filterType }: OutputsGalleryProps) {
  const [artifacts, setArtifacts] = useState<ArtifactListItem[]>([]);
  const [selected, setSelected] = useState<ArtifactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>(filterType ?? "all");

  // Fetch artifacts
  useEffect(() => {
    setLoading(true);
    bookagent.jobs
      .artifacts(jobId)
      .then(setArtifacts)
      .catch(() => setArtifacts([]))
      .finally(() => setLoading(false));
  }, [jobId]);

  // Filter
  const filtered = useMemo(() => {
    if (activeFilter === "all") return artifacts;
    return artifacts.filter((a) => a.artifact_type === activeFilter);
  }, [artifacts, activeFilter]);

  // Stats
  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    let totalSize = 0;
    let validCount = 0;
    let warningCount = 0;

    for (const a of artifacts) {
      byType[a.artifact_type] = (byType[a.artifact_type] ?? 0) + 1;
      totalSize += a.size_bytes;
      if (a.status === "valid") validCount++;
      if (a.warnings.length > 0) warningCount++;
    }

    return { byType, totalSize, validCount, warningCount, total: artifacts.length };
  }, [artifacts]);

  // View artifact detail
  async function viewArtifact(artifactId: string) {
    setLoadingDetail(true);
    try {
      const detail = await bookagent.jobs.artifact(jobId, artifactId);
      setSelected(detail);
    } catch {
      // ignore
    } finally {
      setLoadingDetail(false);
    }
  }

  // -- Loading --
  if (loading) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          Carregando artefatos...
        </CardContent>
      </Card>
    );
  }

  // -- Empty --
  if (artifacts.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          Nenhum artefato gerado para este job.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Summary bar ───────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary" className="gap-1.5">
          📦 {stats.total} artefato(s)
        </Badge>
        <Badge variant="outline" className="gap-1.5 text-emerald-500 border-emerald-500/30">
          ✅ {stats.validCount} valido(s)
        </Badge>
        {stats.warningCount > 0 && (
          <Badge variant="outline" className="gap-1.5 text-amber-500 border-amber-500/30">
            ⚠ {stats.warningCount} com avisos
          </Badge>
        )}
        <Badge variant="outline" className="gap-1.5">
          💾 {formatBytes(stats.totalSize)} total
        </Badge>
      </div>

      {/* ── Filter tabs ───────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_OPTIONS.map((f) => {
          const count = f.key === "all" ? artifacts.length : (stats.byType[f.key] ?? 0);
          if (f.key !== "all" && count === 0) return null;
          return (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                activeFilter === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/40",
              )}
            >
              <span>{f.icon}</span>
              {f.label}
              <span className="text-[10px] opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* ── Content: list + preview ───────────────── */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* List column */}
        <div className="space-y-2.5">
          {filtered.map((a) => (
            <Card
              key={a.id}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                selected?.id === a.id && "ring-2 ring-primary shadow-md",
              )}
              onClick={() => viewArtifact(a.id)}
            >
              <CardContent className="p-4">
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xl shrink-0">
                      {ARTIFACT_ICONS[a.artifact_type] ?? "📄"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="secondary" className="text-[9px] h-4">
                          {a.output_format}
                        </Badge>
                        <Badge variant="outline" className="text-[9px] h-4">
                          {FORMAT_LABELS[a.export_format] ?? a.export_format}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {formatBytes(a.size_bytes)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("text-[9px] shrink-0", STATUS_STYLES[a.status])}
                  >
                    {a.status}
                  </Badge>
                </div>

                {/* Warnings */}
                {a.warnings.length > 0 && (
                  <div className="mt-2 pl-8 space-y-0.5">
                    {a.warnings.slice(0, 3).map((w, i) => (
                      <p key={i} className="text-[10px] text-amber-500 leading-tight">⚠ {w}</p>
                    ))}
                    {a.warnings.length > 3 && (
                      <p className="text-[10px] text-muted-foreground">
                        +{a.warnings.length - 3} mais...
                      </p>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3 pl-8">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2"
                    onClick={(e) => { e.stopPropagation(); viewArtifact(a.id); }}
                  >
                    {loadingDetail && selected?.id === a.id ? "..." : "Visualizar"}
                  </Button>
                  <a
                    href={bookagent.jobs.downloadUrl(jobId, a.id)}
                    download
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button size="sm" variant="secondary" className="h-6 text-[10px] px-2">
                      Download
                    </Button>
                  </a>
                  {a.referenced_asset_count > 0 && (
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      🖼️ {a.referenced_asset_count} asset(s)
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum artefato do tipo selecionado.
            </p>
          )}
        </div>

        {/* Preview column */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          {selected ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {ARTIFACT_ICONS[selected.artifact_type] ?? "📄"}
                  <span className="truncate">{selected.title}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Meta badges */}
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    {FORMAT_LABELS[selected.export_format] ?? selected.export_format}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {selected.output_format}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {formatBytes(selected.size_bytes)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn("text-[10px]", STATUS_STYLES[selected.status])}
                  >
                    {selected.status}
                  </Badge>
                </div>

                {/* Render preview based on format */}
                {selected.export_format === "html" ? (
                  <div className="border rounded-lg overflow-hidden bg-white">
                    <iframe
                      srcDoc={selected.content}
                      className="w-full h-[500px]"
                      title={selected.title}
                      sandbox="allow-same-origin"
                    />
                  </div>
                ) : selected.export_format === "markdown" ? (
                  <div className="bg-muted rounded-lg p-4 overflow-auto max-h-[500px]">
                    <pre className="text-xs whitespace-pre-wrap font-mono">{selected.content}</pre>
                  </div>
                ) : (
                  <div className="bg-muted rounded-lg p-4 overflow-auto max-h-[500px]">
                    <pre className="text-xs font-mono">
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(selected.content), null, 2);
                        } catch {
                          return selected.content;
                        }
                      })()}
                    </pre>
                  </div>
                )}

                {/* Referenced assets */}
                {selected.referenced_asset_ids.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Assets Referenciados ({selected.referenced_asset_ids.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {selected.referenced_asset_ids.slice(0, 10).map((id) => (
                        <Badge key={id} variant="outline" className="text-[9px] font-mono">
                          {id.slice(0, 8)}
                        </Badge>
                      ))}
                      {selected.referenced_asset_ids.length > 10 && (
                        <Badge variant="outline" className="text-[9px]">
                          +{selected.referenced_asset_ids.length - 10}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Download */}
                <a href={bookagent.jobs.downloadUrl(jobId, selected.id)} download>
                  <Button className="w-full">
                    Download {FORMAT_LABELS[selected.export_format] ?? selected.export_format}
                  </Button>
                </a>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-20 text-center">
                <span className="text-4xl block mb-3">👈</span>
                <p className="text-sm text-muted-foreground">
                  Selecione um artefato para visualizar
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
