import Link from "next/link";

export function AppHeader() {
  return (
    <header className="border-b bg-white">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl">📘</span>
          <span className="font-bold">BookAgent</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/dashboard" className="text-slate-500 hover:text-slate-900 transition-colors">
            Dashboard
          </Link>
          <Link href="/upload" className="text-slate-500 hover:text-slate-900 transition-colors">
            Novo Job
          </Link>
        </nav>
      </div>
    </header>
  );
}
