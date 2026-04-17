import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware — bloqueia rotas protegidas redirecionando para /manutencao.
 *
 * Rotas bloqueadas:
 *   /dashboard/**
 *   /upload/**
 *
 * Rotas livres:
 *   / (landing)
 *   /manutencao
 *   /planos
 *   /landing
 *   /_next/** (assets)
 */
export function middleware(request: NextRequest) {
  return NextResponse.redirect(new URL('/manutencao', request.url));
}

export const config = {
  matcher: ['/dashboard/:path*', '/upload/:path*'],
};
