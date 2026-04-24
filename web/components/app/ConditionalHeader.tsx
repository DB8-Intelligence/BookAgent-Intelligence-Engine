"use client";

/**
 * ConditionalHeader — esconde o header global em rotas de marketing
 * (landing, planos) onde o hero luxury tem seu próprio header customizado.
 *
 * Nas demais rotas (dashboard, upload, login) renderiza o header padrão.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "@/components/auth/user-menu";

const MARKETING_PATHS = ["/", "/landing", "/planos", "/beta"];

export function ConditionalHeader() {
  const pathname = usePathname();
  if (MARKETING_PATHS.includes(pathname)) return null;

  return (
    <header className="border-b bg-card">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl">📘</span>
          <span className="font-bold text-foreground">BookReel</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/upload"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Novo Job
          </Link>
          <UserMenu />
        </nav>
      </div>
    </header>
  );
}
