import { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  subtext,
  icon,
  accent = 'default',
}: {
  label: string;
  value: string;
  subtext?: string;
  icon?: ReactNode;
  accent?: 'default' | 'warning' | 'success';
}) {
  const accentClasses = {
    default: 'text-slate-900 dark:text-slate-100',
    warning: 'text-amber-600 dark:text-amber-400',
    success: 'text-emerald-600 dark:text-emerald-400',
  }[accent];

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
        {icon && <span className="text-slate-300 dark:text-slate-600">{icon}</span>}
      </div>
      <span className={`mt-2 text-2xl font-semibold tabular-nums ${accentClasses}`}>{value}</span>
      {subtext && <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtext}</span>}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="h-3 w-20 rounded bg-slate-100 dark:bg-slate-800" />
      <div className="mt-3 h-7 w-16 rounded bg-slate-100 dark:bg-slate-800" />
      <div className="mt-2 h-3 w-24 rounded bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}
