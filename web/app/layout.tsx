import type { Metadata } from "next";
import Link from "next/link";
import { AuthProvider } from "@/lib/auth/auth-context";
import { UserMenu } from "@/components/auth/user-menu";
import { BugReporterWidget } from "@/components/app/BugReporterWidget";
import { ErrorBoundary } from "@/components/app/ErrorBoundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "BookReel Intelligence Engine",
  description: "Transform real estate materials into multi-format content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">
        <ErrorBoundary>
        <AuthProvider>
          <div className="min-h-screen flex flex-col">
            <header className="border-b bg-card">
              <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2">
                  <span className="text-xl">📘</span>
                  <span className="font-bold text-foreground">BookReel</span>
                </Link>
                <nav className="flex items-center gap-6 text-sm">
                  <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
                    Dashboard
                  </Link>
                  <Link href="/upload" className="text-muted-foreground hover:text-foreground transition-colors">
                    Novo Job
                  </Link>
                  <UserMenu />
                </nav>
              </div>
            </header>
            <main className="flex-1">{children}</main>
          </div>
          <BugReporterWidget />
        </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
