import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware — protege rotas do dashboard.
 *
 * Acesso permitido quando:
 *   - Cookie `bookreel_beta` presente com codigo valido
 *
 * Sem cookie valido:
 *   - /dashboard/** e /upload/** redirecionam para /beta
 *
 * Rotas livres (sem check):
 *   / (landing), /beta, /manutencao, /planos, /landing, /_next/**
 */

const VALID_BETA_CODES = new Set([
  'BOOKREEL-BETA-001',
  'BOOKREEL-BETA-002',
  'BOOKREEL-BETA-003',
  'BOOKREEL-BETA-004',
  'BOOKREEL-BETA-005',
  'BOOKREEL-BETA-006',
  'BOOKREEL-BETA-007',
  'BOOKREEL-BETA-008',
  'BOOKREEL-BETA-009',
  'BOOKREEL-BETA-010',
  'DB8-MASTER-2026',
]);

export function middleware(request: NextRequest) {
  const betaCookie = request.cookies.get('bookreel_beta')?.value;

  if (betaCookie && VALID_BETA_CODES.has(betaCookie)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/beta', request.url));
}

export const config = {
  matcher: ['/dashboard/:path*', '/upload/:path*'],
};
