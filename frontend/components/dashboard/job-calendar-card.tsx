'use client';

import { useState } from 'react';
import { useDashboardCalendar } from '../../lib/hooks/use-dashboard';
import { DashboardCard, CardSkeleton, CardError } from './dashboard-card';
import { CalendarJob } from '../../lib/api/dashboard';

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const STATUS_DOT: Record<string, string> = {
  scheduled: 'bg-slate-400',
  in_progress: 'bg-cyan-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-red-500',
  on_hold: 'bg-amber-500',
};

export function JobCalendarCard() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekEnd = addDays(weekStart, 7);
  const { data, error, isLoading } = useDashboardCalendar(weekStart, weekEnd);

  const jobsByDay = groupByDay(data ?? [], weekStart);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <DashboardCard
      title="Job Calendar"
      icon={<GridIcon />}
      headerRight={
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="rounded-md px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800"
            aria-label="Previous week"
          >
            ←
          </button>
          <span className="px-1 text-xs font-medium text-slate-600 dark:text-slate-400">
            {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
            {addDays(weekStart, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="rounded-md px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800"
            aria-label="Next week"
          >
            →
          </button>
        </div>
      }
      padded={false}
    >
      {isLoading && (
        <div className="p-4">
          <CardSkeleton lines={5} />
        </div>
      )}
      {error && (
        <div className="p-4">
          <CardError />
        </div>
      )}

      {!isLoading && !error && (
        <div className="grid grid-cols-7 divide-x divide-slate-100">
          {jobsByDay.map(({ date, jobs }) => {
            const isToday = date.getTime() === today.getTime();
            return (
              <div key={date.toISOString()} className="min-h-[140px] p-2">
                <div className={`mb-1.5 text-center text-xs font-medium ${isToday ? 'text-[var(--color-brand)]' : 'text-slate-400 dark:text-slate-500'}`}>
                  <div>{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div
                    className={`mx-auto mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${
                      isToday ? 'bg-[var(--color-brand)] text-white' : ''
                    }`}
                  >
                    {date.getDate()}
                  </div>
                </div>
                <div className="space-y-1">
                  {jobs.map((job) => (
                    <div
                      key={job.id}
                      className="truncate rounded bg-slate-50 dark:bg-slate-800 px-1.5 py-1 text-[11px] text-slate-700 dark:text-slate-300"
                      title={`${job.title} · ${job.customerName}`}
                    >
                      <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[job.status] ?? 'bg-slate-400'}`} />
                      {job.scheduledStart &&
                        new Date(job.scheduledStart).toLocaleTimeString('en-US', { hour: 'numeric' })}{' '}
                      {job.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}

function groupByDay(jobs: CalendarJob[], weekStart: Date) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return days.map((date) => ({
    date,
    jobs: jobs.filter((j) => {
      if (!j.scheduledStart) return false;
      const jd = new Date(j.scheduledStart);
      return jd.getFullYear() === date.getFullYear() && jd.getMonth() === date.getMonth() && jd.getDate() === date.getDate();
    }),
  }));
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  );
}
