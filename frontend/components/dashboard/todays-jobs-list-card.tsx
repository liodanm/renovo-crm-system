'use client';

import Link from 'next/link';
import { useDashboardSummary } from '../../lib/hooks/use-dashboard';
import { DashboardCard, CardSkeleton, CardError, CardEmpty, CardLocked } from './dashboard-card';

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
  in_progress: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:text-emerald-300',
  cancelled: 'bg-red-100 text-red-700 dark:text-red-300',
  on_hold: 'bg-amber-100 text-amber-700 dark:text-amber-300',
};

function formatTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function TodaysJobsListCard() {
  const { data, error, isLoading } = useDashboardSummary();

  return (
    <DashboardCard title="Today's Jobs" icon={<CalendarIcon />}>
      {isLoading && <CardSkeleton lines={4} />}
      {error && <CardError />}
      {!isLoading && !error && data && !data.todaysJobs && <CardLocked />}
      {!isLoading && !error && data?.todaysJobs && data.todaysJobs.jobs.length === 0 && (
        <CardEmpty message="No jobs scheduled for today." />
      )}
      {!isLoading && !error && data?.todaysJobs && data.todaysJobs.jobs.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {data.todaysJobs.jobs.map((job) => (
            <li key={job.id} className="py-2.5 first:pt-0 last:pb-0">
              <Link href={`/jobs/${job.id}`} className="flex items-start justify-between gap-3 rounded-lg -mx-2 px-2 py-0.5 hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{job.title}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[job.status] ?? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                      {job.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    {job.customerName} · {job.address}
                  </div>
                  {job.crewName && <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Crew: {job.crewName}</div>}
                </div>
                <div className="shrink-0 text-right text-xs text-slate-500 dark:text-slate-400">
                  {formatTime(job.scheduledStart)}
                  {job.scheduledEnd && <> – {formatTime(job.scheduledEnd)}</>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
