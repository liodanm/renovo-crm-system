'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { jobsApi, JOB_STATUS_LABELS, type JobListItem } from '../../lib/api/jobs';
import { AppShell } from '../../components/layout/AppShell';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  paused: 'bg-orange-100 text-orange-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
  on_hold: 'bg-slate-100 text-slate-500',
};

type RangeFilter = 'today' | 'week' | 'all';

function customerName(job: { customerBusinessName: string | null; customerFirstName: string | null; customerLastName: string | null }): string {
  return job.customerBusinessName ?? (`${job.customerFirstName ?? ''} ${job.customerLastName ?? ''}`.trim() || 'Unknown');
}

function formatMoney(value: string): string {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function applyRangeFilter(jobs: JobListItem[], range: RangeFilter): JobListItem[] {
  if (range === 'all') return jobs;
  const now = new Date();
  if (range === 'today') {
    return jobs.filter((j) => j.scheduledStart && isSameDay(new Date(j.scheduledStart), now));
  }
  // This Week — rest of the current week starting today, matching how a
  // field owner actually thinks about "what's coming up," not a Sun–Sat grid.
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return jobs.filter((j) => j.scheduledStart && new Date(j.scheduledStart) >= new Date(now.setHours(0, 0, 0, 0)) && new Date(j.scheduledStart) <= weekEnd);
}

export default function JobsPage() {
  const { data: allJobs, error, isLoading } = useSWR('jobs', () => jobsApi.list());
  const [range, setRange] = useState<RangeFilter>('all');

  const jobs = useMemo(() => {
    if (!allJobs) return undefined;
    const filtered = applyRangeFilter(allJobs, range);
    // Sort by scheduled time — unscheduled jobs (drafts) sink to the
    // bottom rather than interrupting the day's actual order.
    return [...filtered].sort((a, b) => {
      if (!a.scheduledStart && !b.scheduledStart) return 0;
      if (!a.scheduledStart) return 1;
      if (!b.scheduledStart) return -1;
      return new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime();
    });
  }, [allJobs, range]);

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Jobs</h1>
            <p className="mt-1 text-sm text-slate-500">
              {jobs ? `${jobs.length} ${range === 'all' ? 'total' : 'shown'}` : 'Loading…'}
            </p>
          </div>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {([
              { key: 'today', label: 'Today' },
              { key: 'week', label: 'This Week' },
              { key: 'all', label: 'All' },
            ] as { key: RangeFilter; label: string }[]).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setRange(opt.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${range === opt.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {isLoading && <div className="p-8 text-center text-sm text-slate-500">Loading…</div>}
          {error && <div className="p-8 text-center text-sm text-red-600">Couldn't load jobs. Try refreshing.</div>}
          {jobs && jobs.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              {range === 'today' ? (
                <>Nothing scheduled today. <button onClick={() => setRange('all')} className="text-[var(--color-brand)]">View all jobs</button></>
              ) : (
                <>
                  No jobs yet. Convert an accepted estimate from the{' '}
                  <Link href="/estimates" className="text-[var(--color-brand)]">Estimates</Link> page to create one.
                </>
              )}
            </div>
          )}
          {jobs && jobs.length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Job #</th>
                  <th className="px-4 py-3">Scheduled</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Property</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/jobs/${job.id}`} className="font-medium text-[var(--color-brand)]">
                        {job.jobNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {job.scheduledStart
                        ? new Date(job.scheduledStart).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{customerName(job)}</td>
                    <td className="px-4 py-3 text-slate-500">{job.propertyAddressLine1}, {job.propertyCity}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[job.status] ?? 'bg-slate-100 text-slate-700'}`}>
                        {JOB_STATUS_LABELS[job.status] ?? job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(job.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </AppShell>
  );
}
