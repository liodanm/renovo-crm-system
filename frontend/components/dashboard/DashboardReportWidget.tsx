'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import type { DashboardWidget } from '../../lib/dashboard-widgets-registry';
import { cn } from '../../lib/utils';

export function DashboardReportWidget({ widget }: { widget: DashboardWidget }) {
  const { data, error, isLoading, mutate } = useSWR(`dashboard-widget-${widget.id}`, widget.fetchValue);

  return (
    <Link
      href={widget.reportHref}
      className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 transition-colors hover:border-[var(--color-brand)]/40"
    >
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{widget.label}</p>

      {isLoading && <div className="mt-2 h-7 w-20 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />}

      {error && !isLoading && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-xs text-red-500 dark:text-red-400">Unable to load</span>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); mutate(); }}
            className="rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            aria-label="Retry"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      )}

      {!isLoading && !error && data && (
        <>
          <p className={cn(
            'mt-1 text-lg font-semibold',
            data.tone === 'warning' ? 'text-amber-600 dark:text-amber-400' : data.tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100',
          )}>
            {data.display}
          </p>
          {data.sub && <p className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500">{data.sub}</p>}
        </>
      )}
    </Link>
  );
}
