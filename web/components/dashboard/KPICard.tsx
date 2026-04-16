import { cn } from "@/lib/utils";

interface KPICardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  trend?: "up" | "down" | "neutral";
  className?: string;
}

export function KPICard({ label, value, subtitle, icon, trend, className }: KPICardProps) {
  return (
    <div className={cn("bg-white rounded-lg border p-4", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {subtitle && (
            <p className={cn(
              "text-xs",
              trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-500" : "text-slate-500",
            )}>
              {trend === "up" && "+"}{subtitle}
            </p>
          )}
        </div>
        {icon && <span className="text-2xl">{icon}</span>}
      </div>
    </div>
  );
}
