"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const VALID_CODES = new Set([
  "BOOKREEL-BETA-001",
  "BOOKREEL-BETA-002",
  "BOOKREEL-BETA-003",
  "BOOKREEL-BETA-004",
  "BOOKREEL-BETA-005",
  "BOOKREEL-BETA-006",
  "BOOKREEL-BETA-007",
  "BOOKREEL-BETA-008",
  "BOOKREEL-BETA-009",
  "BOOKREEL-BETA-010",
  "DB8-MASTER-2026",
]);

export default function BetaAccessPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const trimmed = code.trim().toUpperCase();

    if (!VALID_CODES.has(trimmed)) {
      setError("Codigo invalido. Verifique e tente novamente.");
      setLoading(false);
      return;
    }

    // Set beta cookie (7 days)
    document.cookie = `bookreel_beta=${trimmed}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;

    // Redirect to dashboard
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="max-w-sm mx-auto px-6 w-full">
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="text-3xl">📘</span>
          <span className="text-2xl font-bold text-slate-900">BookReel</span>
        </div>

        <h1 className="text-xl font-bold text-slate-900 text-center mb-2">
          Beta Fechado
        </h1>
        <p className="text-sm text-slate-500 text-center mb-6">
          Insira seu codigo de convite para acessar o dashboard.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              type="text"
              placeholder="BOOKREEL-BETA-XXX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="text-center font-mono tracking-wider"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || code.trim().length === 0}
          >
            {loading ? "Verificando..." : "Acessar Beta"}
          </Button>
        </form>

        <p className="text-xs text-slate-400 text-center mt-6">
          Nao tem um codigo?{" "}
          <a
            href="https://wa.me/5571999733883?text=Quero%20acessar%20o%20beta%20do%20BookReel"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-600 underline"
          >
            Solicite pelo WhatsApp
          </a>
        </p>
      </div>
    </div>
  );
}
