import { cn } from "@/lib/utils";
import { DASHBOARD_STATUS_CONFIG } from "@/lib/bookagentApi";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = DASHBOARD_STATUS_CONFIG[status] ?? {
    label: status,
    bg: "bg-slate-100 text-slate-600 border-slate-200",
  };

  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
      config.bg,
      className,
    )}>
      {config.label}
    </span>
  );
}
