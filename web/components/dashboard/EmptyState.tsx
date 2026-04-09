interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; href: string };
}

export function EmptyState({ icon = "📭", title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-4xl mb-3">{icon}</span>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      {description && <p className="text-sm text-slate-500 mt-1 max-w-sm">{description}</p>}
      {action && (
        <a
          href={action.href}
          className="mt-4 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800"
        >
          {action.label}
        </a>
      )}
    </div>
  );
}
