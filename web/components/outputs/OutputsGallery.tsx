"use client";

import { useEffect, useState, useMemo } from "react";
import {
  bookagent,
  formatBytes,
  type ArtifactListItem,
  type ArtifactDetail,
} from "@/lib/bookagentApi";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OutputsGalleryProps {
  jobId: string;
}

// ---------------------------------------------------------------------------
// Product config
// ---------------------------------------------------------------------------

interface ProductConfig {
  label: string;
  icon: string;
  description: string;
  color: string;
  primaryFormat: string;
  canRender: boolean;
}

const PRODUCT_CONFIG: Record<string, ProductConfig> = {
  reel: {
    label: "Reel Instagram",
    icon: "🎬",
    description: "Video curto 9:16 para Instagram e TikTok",
    color: "from-pink-500/10 to-purple-500/10",
    primaryFormat: "render-spec",
    canRender: true,
  },
  carousel: {
    label: "Carrossel",
    icon: "📱",
    description: "Slides 1:1 para feed do Instagram",
    color: "from-blue-500/10 to-cyan-500/10",
    primaryFormat: "render-spec",
    canRender: true,
  },
  presentation: {
    label: "Apresentacao Comercial",
    icon: "📊",
    description: "Slides 16:9 para reunioes e propostas",
    color: "from-amber-500/10 to-orange-500/10",
    primaryFormat: "render-spec",
    canRender: true,
  },
  video_long: {
    label: "Video Institucional",
    icon: "🎥",
    description: "Video longo 16:9 para YouTube",
    color: "from-red-500/10 to-rose-500/10",
    primaryFormat: "render-spec",
    canRender: true,
  },
  blog: {
    label: "Artigo para Blog",
    icon: "✍️",
    description: "Post SEO-otimizado com 1500+ palavras",
    color: "from-emerald-500/10 to-teal-500/10",
    primaryFormat: "html",
    canRender: false,
  },
  landing_page: {
    label: "Landing Page",
    icon: "🌐",
    description: "Pagina de captacao com formulario",
    color: "from-violet-500/10 to-indigo-500/10",
    primaryFormat: "html",
    canRender: false,
  },
};

// All possible products — shown even if not yet generated
const ALL_PRODUCT_KEYS = ["reel", "carousel", "presentation", "video_long", "blog", "landing_page"];

// ---------------------------------------------------------------------------
// Group artifacts into products
// ---------------------------------------------------------------------------

interface Product {
  key: string;
  config: ProductConfig;
  primary: ArtifactListItem | null;
  subItems: ArtifactListItem[];
  ready: boolean;
}

function groupIntoProducts(artifacts: ArtifactListItem[]): Product[] {
  const groups: Record<string, ArtifactListItem[]> = {};

  for (const a of artifacts) {
    const key = a.output_format || "other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(a);
  }

  return ALL_PRODUCT_KEYS.map((key) => {
    const config = PRODUCT_CONFIG[key];
    const items = groups[key] ?? [];
    const primary = items.find((i) => i.export_format === config.primaryFormat) ?? items[0] ?? null;
    const subItems = primary ? items.filter((i) => i.id !== primary.id) : [];

    return { key, config, primary, subItems, ready: primary !== null };
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OutputsGallery({ jobId }: OutputsGalleryProps) {
  const [artifacts, setArtifacts] = useState<ArtifactListItem[]>([]);
  const [selected, setSelected] = useState<ArtifactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] = useState<Record<string, string>>({});
  const [renderLoading, setRenderLoading] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    bookagent.jobs
      .artifacts(jobId)
      .then(setArtifacts)
      .catch(() => setArtifacts([]))
      .finally(() => setLoading(false));
  }, [jobId]);

  const products = useMemo(() => groupIntoProducts(artifacts), [artifacts]);
  const readyCount = products.filter((p) => p.ready).length;

  async function triggerRender(artifactId: string) {
    setRenderLoading(artifactId);
    try {
      const result = await bookagent.dashboard.renderVideo(jobId, artifactId);
      setRenderStatus((prev) => ({ ...prev, [artifactId]: result.status }));
    } catch (err) {
      setRenderStatus((prev) => ({
        ...prev,
        [artifactId]: err instanceof Error ? err.message : "Erro",
      }));
    } finally {
      setRenderLoading(null);
    }
  }

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

  if (loading) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          Carregando conteudos...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <p className="text-sm text-muted-foreground">
        {readyCount} de {products.length} produtos prontos
      </p>

      {/* Products + Preview */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Product cards */}
        <div className="lg:col-span-3 space-y-3">
          {products.map((product) => (
            <Card
              key={product.key}
              className={cn(
                "overflow-hidden transition-all",
                product.ready && "hover:shadow-md",
                !product.ready && "opacity-60",
              )}
            >
              <div className={cn("bg-gradient-to-r p-4", product.config.color)}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{product.config.icon}</span>
                    <div>
                      <h3 className="font-semibold text-sm">{product.config.label}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {product.config.description}
                      </p>
                    </div>
                  </div>
                  {product.ready ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-emerald-600 border-emerald-300 bg-white/50 shrink-0"
                    >
                      Pronto
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-amber-600 border-amber-300 bg-white/50 shrink-0"
                    >
                      Em processamento
                    </Badge>
                  )}
                </div>
              </div>

              {product.ready && product.primary && (
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => viewArtifact(product.primary!.id)}
                    >
                      {loadingDetail && selected?.id === product.primary.id
                        ? "Carregando..."
                        : "Visualizar"}
                    </Button>

                    <a href={bookagent.jobs.downloadUrl(jobId, product.primary.id)} download>
                      <Button size="sm" variant="secondary" className="text-xs">
                        Download
                      </Button>
                    </a>

                    {product.config.canRender && (
                      <Button
                        size="sm"
                        className="text-xs bg-emerald-600 hover:bg-emerald-700"
                        disabled={
                          renderLoading === product.primary.id ||
                          renderStatus[product.primary.id] === "queued"
                        }
                        onClick={() => triggerRender(product.primary!.id)}
                      >
                        {renderLoading === product.primary.id
                          ? "Enviando..."
                          : renderStatus[product.primary.id] === "queued"
                            ? "Na fila"
                            : "Gerar Video"}
                      </Button>
                    )}

                    {renderStatus[product.primary.id] &&
                      renderStatus[product.primary.id] !== "queued" && (
                        <span className="text-xs text-red-500">
                          {renderStatus[product.primary.id]}
                        </span>
                      )}
                  </div>

                  {product.subItems.length > 0 && (
                    <button
                      className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() =>
                        setExpandedProduct(
                          expandedProduct === product.key ? null : product.key,
                        )
                      }
                    >
                      {expandedProduct === product.key ? "- Ocultar" : "+"}{" "}
                      {product.subItems.length} formato(s) adicional(is)
                    </button>
                  )}

                  {expandedProduct === product.key && (
                    <div className="space-y-1.5 pl-2 border-l-2 border-muted">
                      {product.subItems.map((sub) => (
                        <div key={sub.id} className="flex items-center gap-2 py-1">
                          <Badge variant="outline" className="text-[9px] h-4">
                            {sub.export_format.toUpperCase()}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground flex-1 truncate">
                            {sub.title}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatBytes(sub.size_bytes)}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 text-[10px] px-1.5"
                            onClick={() => viewArtifact(sub.id)}
                          >
                            Ver
                          </Button>
                          <a href={bookagent.jobs.downloadUrl(jobId, sub.id)} download>
                            <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5">
                              Baixar
                            </Button>
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}

              {!product.ready && (
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full w-2/3 bg-amber-400 rounded-full animate-pulse" />
                    </div>
                    <span className="text-[10px] text-muted-foreground">Processando...</span>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        {/* Preview column */}
        <div className="lg:col-span-2 lg:sticky lg:top-20 lg:self-start">
          {selected ? (
            <Card>
              <CardContent className="p-4 space-y-4">
                <h3 className="text-sm font-semibold truncate">{selected.title}</h3>

                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    {selected.export_format.toUpperCase()}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {formatBytes(selected.size_bytes)}
                  </Badge>
                </div>

                {/* Preview — HTML rendered in iframe, others as formatted text */}
                {(() => {
                  const raw = selected.content;
                  const contentStr =
                    typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);

                  // HTML content (blog, landing page) — render in iframe
                  if (
                    selected.export_format === "html" ||
                    (typeof raw === "string" && raw.trim().startsWith("<!DOCTYPE"))
                  ) {
                    return (
                      <div className="border rounded-lg overflow-hidden bg-white">
                        <iframe
                          srcDoc={contentStr}
                          className="w-full h-[600px]"
                          title={selected.title}
                          sandbox="allow-same-origin"
                        />
                      </div>
                    );
                  }

                  // Markdown
                  if (selected.export_format === "markdown") {
                    return (
                      <div className="bg-muted rounded-lg p-4 overflow-auto max-h-[600px]">
                        <pre className="text-xs whitespace-pre-wrap font-mono">
                          {contentStr}
                        </pre>
                      </div>
                    );
                  }

                  // JSON / render-spec — formatted
                  const formatted =
                    typeof raw === "object" && raw !== null
                      ? JSON.stringify(raw, null, 2)
                      : (() => {
                          try {
                            return JSON.stringify(JSON.parse(contentStr), null, 2);
                          } catch {
                            return contentStr;
                          }
                        })();
                  return (
                    <div className="bg-muted rounded-lg p-4 overflow-auto max-h-[600px]">
                      <pre className="text-xs font-mono">{formatted}</pre>
                    </div>
                  );
                })()}

                <a href={bookagent.jobs.downloadUrl(jobId, selected.id)} download>
                  <Button className="w-full" size="sm">
                    Download
                  </Button>
                </a>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-20 text-center">
                <span className="text-3xl block mb-2">👈</span>
                <p className="text-sm text-muted-foreground">
                  Clique em "Visualizar" para pre-visualizar o conteudo
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
