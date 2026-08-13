'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { jobsApi, JOB_STATUS_LABELS, JOB_PRIORITY_LABELS, JOB_PRIORITY_COLORS, type JobListItem } from '../../lib/api/jobs';
import { AppShell } from '../../components/layout/AppShell';
import { MobileListCard } from '../../components/ui/mobile-list-card';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:text-amber-300',
  paused: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:text-emerald-300',
  cancelled: 'bg-red-100 text-red-700 dark:text-red-300',
  on_hold: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
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
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Jobs</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {jobs ? `${jobs.length} ${range === 'all' ? 'total' : 'shown'}` : 'Loading…'}
            </p>
          </div>
          <div className="flex gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
            {([
              { key: 'today', label: 'Today' },
              { key: 'week', label: 'This Week' },
              { key: 'all', label: 'All' },
            ] as { key: RangeFilter; label: string }[]).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setRange(opt.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${range === opt.key ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          {isLoading && <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>}
          {error && <div className="p-8 text-center text-sm text-red-600 dark:text-red-400">Couldn't load jobs. Try refreshing.</div>}
          {jobs && jobs.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
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
            <>
              {/* Desktop: existing table, byte-for-byte unchanged, just wrapped. */}
              <table className="hidden w-full text-sm lg:table">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
                    <tr key={job.id} className="hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {job.priority !== 'normal' && (
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: JOB_PRIORITY_COLORS[job.priority].dot }}
                              title={JOB_PRIORITY_LABELS[job.priority]}
                            />
                          )}
                          <Link href={`/jobs/${job.id}`} className="font-medium text-[var(--color-brand)]">
                            {job.jobNumber}
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {job.scheduledStart
                          ? new Date(job.scheduledStart).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{customerName(job)}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{job.propertyAddressLine1}, {job.propertyCity}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[job.status] ?? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                          {JOB_STATUS_LABELS[job.status] ?? job.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-slate-100">{formatMoney(job.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile: same data, card layout. No fields hidden — Job #
                  and Property move into the meta row. */}
              <div className="space-y-3 p-3 lg:hidden">
                {jobs.map((job) => (
                  <MobileListCard
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    title={customerName(job)}
                    subtitle={`${job.propertyAddressLine1}, ${job.propertyCity}`}
                    statusLabel={JOB_STATUS_LABELS[job.status] ?? job.status}
                    statusClassName={STATUS_STYLES[job.status]}
                    amount={formatMoney(job.price)}
                    amountLabel="Price"
                    meta={[
                      { label: 'Job #', value: job.jobNumber },
                      {
                        label: 'Scheduled',
                        value: job.scheduledStart
                          ? new Date(job.scheduledStart).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                          : 'Unscheduled',
                      },
                      ...(job.priority !== 'normal' ? [{ label: 'Priority', value: JOB_PRIORITY_LABELS[job.priority] }] : []),
                    ]}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}
