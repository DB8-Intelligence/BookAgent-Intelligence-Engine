/**
 * Auth Callback — não mais necessário com Firebase Auth.
 *
 * Firebase Auth usa `signInWithPopup` (fluxo totalmente client-side) ou
 * `signInWithRedirect` (que também retorna pro mesmo domínio e é
 * interceptado pelo SDK client automaticamente). Não há code exchange
 * server-side como o Supabase fazia.
 *
 * Mantemos a rota só como fallback de redirect pra backward-compat de
 * links antigos. Redireciona pra /dashboard (ou /login se user não logado).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const next = searchParams.get("next") ?? "/dashboard";
  return NextResponse.redirect(`${origin}${next}`);
}
