"use client";

/**
 * RequireAuth — wrapper que redireciona pra /login se o user não está
 * autenticado no Firebase. Substitui a checagem server-side que o
 * middleware.ts fazia via Supabase cookies.
 */

import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      const redirectTo = encodeURIComponent(pathname);
      router.replace(`/login?redirect=${redirectTo}`);
    }
  }, [loading, user, router, pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        Carregando…
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
