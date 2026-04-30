/**
 * Middleware — Host-based routing for bookreel.ai (landing) vs bookreel.app (app).
 *
 * Cloud Run serve um único container com mesma origin pra ambos os domínios
 * (Sprint 3.4 fez o domain mapping). Este middleware diferencia o que cada
 * domínio mostra na rota raiz:
 *
 *   bookreel.ai   →  rewrite /  →  /landing  (site público novo)
 *   bookreel.app  →  /  passa direto pra app/page.tsx (landing legada INTERMETRIX)
 *   *.run.app     →  passa direto (acesso interno/debug)
 *
 * Outras rotas (/login, /dashboard, /upload, etc) NÃO são afetadas — funcionam
 * em qualquer host. Se quiser bloquear /dashboard em bookreel.ai depois,
 * adicionar branch específica aqui.
 *
 * Sessão Firebase ainda vive em localStorage; proteção de rota continua
 * client-side via <RequireAuth/> nos layouts.
 */

import { NextResponse, type NextRequest } from "next/server";

const LANDING_HOSTS = new Set([
  "bookreel.ai",
  "www.bookreel.ai",
]);

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const path = request.nextUrl.pathname;

  // Só fazemos rewrite na rota raiz pra não afetar assets, API ou rotas internas.
  if (path === "/" && LANDING_HOSTS.has(host)) {
    const url = request.nextUrl.clone();
    url.pathname = "/landing";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Roda em rota raiz e em /landing/* (caso queira reescrever sub-paths futuramente).
  // Não filtra _next/static — Next já exclui assets internos do middleware automaticamente.
  matcher: ["/", "/landing/:path*"],
};
