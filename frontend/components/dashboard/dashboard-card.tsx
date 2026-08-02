import { ReactNode } from 'react';

export function DashboardCard({
  title,
  icon,
  headerRight,
  children,
  className = '',
  padded = true,
}: {
  title: string;
  icon?: ReactNode;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          {icon && <span className="text-slate-400">{icon}</span>}
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        </div>
        {headerRight}
      </header>
      <div className={`flex-1 ${padded ? 'p-4' : ''}`}>{children}</div>
    </section>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-slate-100" style={{ width: `${85 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function CardError({ message = "Couldn't load this data" }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
      <span aria-hidden>⚠</span> {message}
    </div>
  );
}

export function CardEmpty({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div>
      <p className="py-2 text-sm text-slate-400">{message}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function CardLocked({ message = "You don't have access to this data" }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
      <span aria-hidden>🔒</span> {message}
    </div>
  );
}
