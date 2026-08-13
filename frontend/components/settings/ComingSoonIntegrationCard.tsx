'use client';

interface Props {
  name: string;
  description: string;
  logoInitial: string;
}

export function ComingSoonIntegrationCard({ name, description, logoInitial }: Props) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-4 opacity-80">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-300 text-sm font-bold text-white">{logoInitial}</div>
          <div>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">{name}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{description}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400">Coming Soon</span>
      </div>
    </div>
  );
}
