"use client";

/**
 * Galeria de vídeos prontos — consome /api/v1/dashboard/gallery (agrega
 * artifacts de todos os jobs do tenant). Mostra player + download por item.
 *
 * Filtros: tipo (vídeo, imagem, tudo), só items com URL de download.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { bookagent, type GalleryItem, formatBytes, timeAgo } from "@/lib/bookagentApi";
import { PageHeader } from "@/components/dashboard/PageHeader";

type FilterType = "all" | "video" | "image";

export default function GalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("video");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // type=VIDEO_RENDER filtra renders de vídeo no backend; vazio traz tudo.
      const typeParam = filter === "video" ? "VIDEO_RENDER" : undefined;
      const res = await bookagent.dashboard.gallery({
        type: typeParam,
        onlyWithDownload: true,
        limit: 100,
      });
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar galeria");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    if (filter === "image") {
      return items.filter((i) => (i.mimeType ?? "").startsWith("image/"));
    }
    if (filter === "video") {
      return items.filter((i) => (i.mimeType ?? "").startsWith("video/"));
    }
    return items;
  }, [items, filter]);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Galeria"
        description="Todos os vídeos e materiais prontos da sua conta"
        action={
          <Link
            href="/upload"
            className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800"
          >
            + Gerar novo
          </Link>
        }
      />

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(["video", "image", "all"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              filter === f
                ? "bg-slate-900 text-white"
                : "bg-white border text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f === "video" ? "🎬 Vídeos" : f === "image" ? "🖼️ Imagens" : "📦 Tudo"}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
          Carregando galeria…
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="bg-white border rounded-lg p-12 text-center">
          <div className="text-5xl mb-3">🎬</div>
          <p className="text-slate-700 font-medium mb-1">Nenhum material ainda</p>
          <p className="text-slate-500 text-sm mb-4">
            Assim que seus jobs completarem, os vídeos aparecem aqui.
          </p>
          <Link
            href="/upload"
            className="inline-block px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800"
          >
            Criar primeiro job
          </Link>
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((item) => (
            <GalleryCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function GalleryCard({ item }: { item: GalleryItem }) {
  const isVideo = (item.mimeType ?? "").startsWith("video/");
  const isImage = (item.mimeType ?? "").startsWith("image/");

  return (
    <div className="bg-white border rounded-lg overflow-hidden flex flex-col">
      <div className="aspect-[9/16] bg-slate-900 relative">
        {isVideo && item.downloadUrl ? (
          <video
            src={item.downloadUrl}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-contain"
          />
        ) : isImage && item.downloadUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.downloadUrl}
            alt={item.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-slate-400 text-4xl">
            📄
          </div>
        )}
      </div>

      <div className="p-3 flex-1 flex flex-col">
        <p className="text-sm font-medium text-slate-900 truncate" title={item.title}>
          {item.title}
        </p>
        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
          <span>{item.type}</span>
          {item.sizeBytes ? <span>· {formatBytes(item.sizeBytes)}</span> : null}
          <span>· {timeAgo(item.createdAt)}</span>
        </p>

        <div className="mt-3 flex items-center gap-2">
          <Link
            href={`/dashboard/jobs/${item.jobId}`}
            className="flex-1 text-center text-xs px-2 py-1.5 border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50"
          >
            Ver job
          </Link>
          {item.downloadUrl && (
            <a
              href={item.downloadUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center text-xs px-2 py-1.5 bg-slate-900 text-white rounded-md hover:bg-slate-800"
            >
              ⬇ Download
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
