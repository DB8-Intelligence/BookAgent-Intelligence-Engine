"use client";

/**
 * Bug Reporter Widget — Floating button + dialog for in-app bug reporting.
 *
 * Captures automatic context: URL, pathname, user agent, viewport,
 * and last 10 API calls from the ring buffer.
 *
 * Only visible to authenticated users.
 */

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { bookagent, getApiLog } from "@/lib/bookagentApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Severity = "blocker" | "bug" | "suggestion";

const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; emoji: string }> = {
  blocker: { label: "Bloqueante", color: "border-red-500 bg-red-50 text-red-700", emoji: "🔴" },
  bug: { label: "Bug", color: "border-amber-500 bg-amber-50 text-amber-700", emoji: "🟡" },
  suggestion: { label: "Sugestao", color: "border-blue-500 bg-blue-50 text-blue-700", emoji: "🔵" },
};

export function BugReporterWidget() {
  const { user } = useAuth();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("bug");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only show for authenticated users
  if (!user) return null;

  function resetForm() {
    setTitle("");
    setDescription("");
    setSeverity("bug");
    setError(null);
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (title.length < 3) {
      setError("Titulo precisa ter pelo menos 3 caracteres");
      return;
    }

    setSubmitting(true);
    setError(null);

    const context = {
      url: typeof window !== "undefined" ? window.location.href : "",
      route: pathname,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      viewport:
        typeof window !== "undefined"
          ? { width: window.innerWidth, height: window.innerHeight }
          : null,
      api_log: getApiLog(),
      timestamp: new Date().toISOString(),
    };

    try {
      await bookagent.bugs.create({ title, description, severity, context });
      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        resetForm();
      }, 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => { setOpen(true); setSuccess(false); setError(null); }}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-all hover:bg-zinc-800 hover:scale-105 active:scale-95"
        aria-label="Reportar bug"
      >
        <span>🐛</span>
        <span className="hidden sm:inline">Reportar bug</span>
      </button>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reportar um problema</DialogTitle>
            <DialogDescription>
              O contexto da pagina e ultimas requisicoes serao incluidos automaticamente.
            </DialogDescription>
          </DialogHeader>

          {success ? (
            <div className="py-8 text-center space-y-2">
              <span className="text-4xl block">✅</span>
              <p className="text-sm text-muted-foreground">Report enviado com sucesso!</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label htmlFor="bug-title" className="text-sm font-medium mb-1 block">
                  Titulo *
                </label>
                <Input
                  id="bug-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Descreva o problema em uma frase"
                  maxLength={200}
                  required
                  minLength={3}
                />
              </div>

              {/* Description */}
              <div>
                <label htmlFor="bug-desc" className="text-sm font-medium mb-1 block">
                  Detalhes (opcional)
                </label>
                <Textarea
                  id="bug-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="O que voce estava fazendo? O que esperava que acontecesse?"
                  maxLength={4000}
                  rows={3}
                />
              </div>

              {/* Severity */}
              <div>
                <p className="text-sm font-medium mb-2">Severidade</p>
                <div className="flex gap-2">
                  {(Object.entries(SEVERITY_CONFIG) as [Severity, typeof SEVERITY_CONFIG[Severity]][]).map(
                    ([key, cfg]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSeverity(key)}
                        className={cn(
                          "flex-1 rounded-md border-2 py-2 px-3 text-xs font-medium transition-all",
                          severity === key ? cfg.color : "border-muted bg-muted/30 text-muted-foreground",
                        )}
                      >
                        {cfg.emoji} {cfg.label}
                      </button>
                    ),
                  )}
                </div>
              </div>

              {/* Context notice */}
              <p className="text-[11px] text-muted-foreground">
                Dados incluidos: URL atual, navegador, tamanho da tela, ultimas {getApiLog().length || "N"} chamadas de API.
              </p>

              {/* Error */}
              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}

              {/* Submit */}
              <Button type="submit" className="w-full" disabled={submitting || title.length < 3}>
                {submitting ? "Enviando..." : "Enviar report"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
