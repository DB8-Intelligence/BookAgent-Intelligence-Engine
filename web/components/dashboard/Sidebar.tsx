"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: "📊" },
  { href: "/dashboard/jobs", label: "Jobs", icon: "📋" },
  { href: "/dashboard/publications", label: "Publicacoes", icon: "📢" },
  { href: "/dashboard/campaigns", label: "Campanhas", icon: "🎯" },
  { href: "/dashboard/usage", label: "Uso", icon: "📈" },
  { href: "/dashboard/billing", label: "Plano", icon: "💳" },
  { href: "/dashboard/insights", label: "Insights", icon: "💡" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "📉" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r bg-white hidden md:block">
      <div className="p-4 border-b">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <span>📘</span> BookAgent
        </Link>
      </div>
      <nav className="p-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-slate-100 text-slate-900 font-medium"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-2 mt-4 border-t">
        <Link
          href="/upload"
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors"
        >
          + Novo Job
        </Link>
      </div>
    </aside>
  );
}
