"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function UserMenu() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  if (loading) return null;

  if (!user) {
    return (
      <Link
        href="/login"
        className="text-sm font-medium text-foreground hover:text-foreground/80 transition-colors"
      >
        Entrar
      </Link>
    );
  }

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground hidden sm:inline">
        {user.email}
      </span>
      <button
        onClick={handleSignOut}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Sair
      </button>
    </div>
  );
}
