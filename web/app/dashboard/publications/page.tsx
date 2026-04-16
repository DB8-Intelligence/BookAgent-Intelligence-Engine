"use client";

import { useEffect, useState, useCallback } from "react";
import { bookagent, type DashboardPublications } from "@/lib/bookagentApi";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { KPICard } from "@/components/dashboard/KPICard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { EmptyState } from "@/components/dashboard/EmptyState";

export default function PublicationsPage() {
  const [data, setData] = useState<DashboardPublications | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await bookagent.dashboard.publications();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar publicacoes");
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
      <PageHeader title="Publicacoes" description="Historico de publicacoes nas redes sociais" />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KPICard label="Total" value={data.total} icon="📊" />
        <KPICard label="Publicadas" value={data.published} icon="✅" />
        <KPICard label="Falharam" value={data.failed} icon="❌" />
        <KPICard label="Pendentes" value={data.pending} icon="⏳" />
      </div>

      {/* Publications Table */}
      {data.publications.length === 0 ? (
        <EmptyState
          icon="📢"
          title="Nenhuma publicacao encontrada"
          description="As publicacoes aparecerao aqui quando voce publicar conteudo nas redes sociais."
        />
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Plataforma</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Post ID</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Link</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Erro</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">Tentativas</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.publications.map((pub) => (
                  <tr key={pub.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <PlatformIcon platform={pub.platform} />
                        <span className="text-slate-900 capitalize">{pub.platform}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={pub.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                      {pub.platformPostId ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {pub.postUrl ? (
                        <a
                          href={pub.postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-xs"
                        >
                          Abrir post
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {pub.error ? (
                        <span className="text-red-600 text-xs">{pub.error}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">{pub.attempts}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {pub.publishedAt
                        ? new Date(pub.publishedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                        : new Date(pub.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function PlatformIcon({ platform }: { platform: string }) {
  const p = platform.toLowerCase();
  if (p === "instagram") {
    return (
      <svg className="w-4 h-4 text-pink-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    );
  }
  if (p === "facebook") {
    return (
      <svg className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    );
  }
  return <span className="text-lg">📱</span>;
}
