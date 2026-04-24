/**
 * Middleware — no-op com Firebase Auth.
 *
 * Firebase armazena sessão em localStorage (client-side), não em cookies
 * HTTP-only como o Supabase SSR fazia. O Next.js middleware roda no Edge
 * Runtime antes da página hidratar e não consegue ler localStorage, então
 * não dá pra decidir redirect aqui.
 *
 * Proteção de rotas agora é client-side via web/components/auth/RequireAuth.tsx
 * dentro dos layouts das rotas protegidas (/dashboard, /upload, etc.).
 *
 * Este arquivo permanece como placeholder pra caso queira voltar a checar
 * algo server-side (ex: edge-validado via Firebase Session Cookies, que
 * exigem backend setup separado).
 */

import { NextResponse, type NextRequest } from "next/server";

export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  // Matcher vazio efetivamente desabilita o middleware.
  // Mantido pro Next não reclamar e fácil de reativar depois.
  matcher: [],
};
