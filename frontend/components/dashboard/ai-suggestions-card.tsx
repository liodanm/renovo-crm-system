'use client';

import { useDashboardAiSuggestions } from '../../lib/hooks/use-dashboard';
import { DashboardCard, CardSkeleton, CardError } from './dashboard-card';

const PRIORITY_STYLES: Record<string, string> = {
  high: 'border-l-red-400 bg-red-50 dark:bg-red-950/60',
  medium: 'border-l-amber-400 bg-amber-50 dark:bg-amber-950/60',
  low: 'border-l-slate-300 bg-slate-50 dark:bg-slate-800',
};

export function AiSuggestionsCard() {
  const { data, error, isLoading } = useDashboardAiSuggestions();

  return (
    <DashboardCard title="AI Suggestions" icon={<SparkleIcon />}>
      {isLoading && <CardSkeleton lines={3} />}
      {error && <CardError message="Couldn't load suggestions right now" />}
      {!isLoading && !error && data && (
        <ul className="space-y-2">
          {data.map((s) => (
            <li key={s.id} className={`rounded-lg border-l-4 px-3 py-2 ${PRIORITY_STYLES[s.priority]}`}>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{s.title}</div>
              <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{s.detail}</div>
              {s.actionHref && s.actionLabel && (
                <a href={s.actionHref} className="mt-1.5 inline-block text-xs font-medium text-[var(--color-brand)] hover:underline">
                  {s.actionLabel} →
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6z" />
    </svg>
  );
}
