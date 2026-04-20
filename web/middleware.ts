import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Middleware — protege rotas autenticadas.
 *
 * Rotas protegidas (requer sessao Supabase):
 *   /dashboard/**, /upload/**, /pipeline/**, /outputs/**
 *
 * Rotas de auth (redireciona para dashboard se ja logado):
 *   /login, /register
 *
 * Rotas livres:
 *   /, /landing, /planos, /beta, /auth/callback, /_next/**
 */

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data: { session } } = await supabase.auth.getSession();
  const path = request.nextUrl.pathname;

  // Protected routes — redirect to login if no session
  if (!session && isProtectedRoute(path)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', path);
    return NextResponse.redirect(loginUrl);
  }

  // Auth routes — redirect to dashboard if already logged in
  if (session && isAuthRoute(path)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

function isProtectedRoute(path: string): boolean {
  return (
    path.startsWith('/dashboard') ||
    path.startsWith('/upload') ||
    path.startsWith('/pipeline') ||
    path.startsWith('/outputs')
  );
}

function isAuthRoute(path: string): boolean {
  return path === '/login' || path === '/register';
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/upload/:path*',
    '/pipeline/:path*',
    '/outputs/:path*',
    '/login',
    '/register',
  ],
};
