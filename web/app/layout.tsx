import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { AuthProvider } from "@/lib/auth/auth-context";
import { BugReporterWidget } from "@/components/app/BugReporterWidget";
import { ErrorBoundary } from "@/components/app/ErrorBoundary";
import { ConditionalHeader } from "@/components/app/ConditionalHeader";
import "./globals.css";

// Playfair — serif editorial para headlines luxury ("Arquitetos da Realidade")
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

// Inter — sans-serif neutro para body
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BookReel — Arquitetos da Realidade",
  description:
    "Transformamos books imobiliários em ecossistemas de conteúdo multimodal. Da narrativa visual à distribuição automatizada.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${playfair.variable} ${inter.variable}`}>
      <body className="font-sans antialiased">
        <ErrorBoundary>
          <AuthProvider>
            <div className="min-h-screen flex flex-col">
              <ConditionalHeader />
              <main className="flex-1">{children}</main>
            </div>
            <BugReporterWidget />
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
