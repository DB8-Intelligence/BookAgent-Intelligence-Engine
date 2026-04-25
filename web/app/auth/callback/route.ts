/**
 * Auth Callback — fallback de redirect.
 *
 * Firebase Auth resolve sign-in 100% client-side (popup/redirect interceptados
 * pelo SDK). Esta rota só preserva links antigos: redireciona pra ?next= ou
 * /dashboard.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const next = searchParams.get("next") ?? "/dashboard";
  return NextResponse.redirect(`${origin}${next}`);
}
