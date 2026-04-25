/**
 * Middleware — no-op.
 *
 * Sessão Firebase vive em localStorage; Edge Runtime não acessa localStorage,
 * então proteção de rota é client-side via <RequireAuth/> nos layouts.
 * Placeholder mantido pra caso de Firebase Session Cookies validados no Edge.
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
