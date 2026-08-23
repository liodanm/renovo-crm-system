'use client';

import { Suspense, useState } from 'react';
import useSWR from 'swr';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPinOff } from 'lucide-react';
import { reportsApi, resolvePreset, DATE_PRESETS, type DatePreset } from '../../../lib/api/reports';
import { cn } from '../../../lib/utils';

function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function minutes(value: number | null): string {
  return value == null ? '—' : `${value} min`;
}
function variance(value: number | null): string {
  if (value == null) return 'Not Yet Available';
  return `${value >= 0 ? '+' : ''}${value} min`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function RouteEfficiencyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStart = searchParams.get('start');
  const [preset, setPreset] = useState<DatePreset>(urlStart ? 'Custom' : 'This Month');
  const resolved = resolvePreset(preset);
  const startIso = resolved.start.toISOString();
  const endIso = resolved.end.toISOString();

  const { data: summary, error, isLoading } = useSWR(['route-eff-summary', startIso, endIso], () => reportsApi.getRouteEfficiencySummary(startIso, endIso));
  const { data: byDay, isLoading: byDayLoading } = useSWR(['route-eff-day', startIso, endIso], () => reportsApi.getRouteEfficiencyByDay(startIso, endIso));

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/settings/reports" className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">← Reports</Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Route & Job Efficiency</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Are jobs being completed efficiently, according to what Renovo actually captures — not a geographic route-optimization report.</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
          {DATE_PRESETS.filter((p) => p !== 'Custom').map((p) => (
            <button key={p} onClick={() => { setPreset(p); router.replace('/reports/route-efficiency'); }}
              className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium', preset === p ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400')}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {error && !isLoading && <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">We couldn't load this report right now. Please try refreshing.</p>}

      {!error && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Kpi label="Completed Jobs" value={summary?.completedJobs ?? '—'} />
            <Kpi label="Cancelled Jobs" value={summary?.cancelledJobs ?? '—'} />
            <Kpi label="Cancellation Rate" value={summary?.cancellationRatePercent != null ? `${summary.cancellationRatePercent}%` : '—'} />
            <Kpi label="Completed Jobs / Calendar Day" value={summary?.jobsPerCalendarDay ?? '—'} />
            <Kpi label="Avg Actual Duration" value={minutes(summary?.averageActualDurationMinutes ?? null)} />
            <Kpi label="Avg Scheduled Duration" value={minutes(summary?.averageScheduledDurationMinutes ?? null)} />
            <Kpi label="Avg Schedule Variance" value={variance(summary?.averageScheduleVarianceMinutes ?? null)} tone={summary?.averageScheduleVarianceMinutes != null && summary.averageScheduleVarianceMinutes > 0 ? 'warning' : undefined} />
            <Kpi label="Revenue / Labor Hour" value={summary?.revenuePerLaborHour != null ? money(summary.revenuePerLaborHour) : 'Not Yet Available'} />
          </div>

          {/* Late Job = actual_start later than scheduled_start, exact
              comparison — no invented 15/30-minute grace period, since
              no existing Renovo business rule defines one. */}
          <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Jobs Started Late</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Actual start later than scheduled start — no grace period applied.</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{summary?.lateStartJobs ?? '—'}</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {summary?.lateStartRatePercent != null ? `of ${summary.jobsWithStartComparison} jobs with both times recorded (${summary.lateStartRatePercent}%)` : '—'}
              </span>
            </div>
          </div>

          {/* Explicit, honest limitations — not silently omitted. */}
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
            <MapPinOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <span>
              <strong className="text-slate-700 dark:text-slate-300">Travel Time & Mileage — Not Yet Available.</strong> Renovo captures GPS coordinates at job start/end but doesn&apos;t store travel time, distance, or route data between jobs, so this can&apos;t be calculated reliably — showing an estimate from calendar gaps or straight-line GPS distance would be a fabricated number, not a measured one.
              <br /><strong className="text-slate-700 dark:text-slate-300">Rescheduled Jobs — Not Yet Available.</strong> There&apos;s no reliable reschedule-event history to distinguish an actual reschedule from a job that was simply always going to be on this date — inferring one from appointment-date differences would be a guess, not a fact.
            </span>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">By Day</h2>
            <div className="mt-3 overflow-x-auto">
              {byDayLoading && <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />}
              {!byDayLoading && byDay?.length === 0 && <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No completed jobs in this date range.</p>}
              {!byDayLoading && byDay && byDay.length > 0 && (
                <table className="w-full min-w-[640px] text-xs">
                  <thead className="text-slate-400 dark:text-slate-500">
                    <tr>
                      <th className="pb-1.5 text-left font-medium">Date</th>
                      <th className="pb-1.5 text-right font-medium">Jobs</th>
                      <th className="pb-1.5 text-right font-medium">Revenue</th>
                      <th className="pb-1.5 text-right font-medium">Labor Hours</th>
                      <th className="pb-1.5 text-right font-medium">Avg Job Duration</th>
                      <th className="pb-1.5 text-right font-medium">Schedule Variance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {byDay.map((d) => (
                      <tr key={d.date}>
                        <td className="py-1.5 text-slate-700 dark:text-slate-300">{fmtDate(d.date)}</td>
                        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{d.jobs}</td>
                        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{money(d.revenue)}</td>
                        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{Number(d.laborHours).toFixed(1)}</td>
                        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{minutes(d.averageDurationMinutes != null ? Number(d.averageDurationMinutes) : null)}</td>
                        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{variance(d.scheduleVarianceMinutes != null ? Number(d.scheduleVarianceMinutes) : null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function Kpi({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'warning' }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold', tone === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100')}>{value}</p>
    </div>
  );
}

export default function RouteEfficiencyPage() {
  return (
    <Suspense fallback={null}>
      <RouteEfficiencyInner />
    </Suspense>
  );
}
