'use client';

import { Suspense, useState } from 'react';
import useSWR from 'swr';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { reportsApi, resolvePreset, DATE_PRESETS, type DatePreset } from '../../../lib/api/reports';
import { cn } from '../../../lib/utils';

function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function AverageTicketInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStart = searchParams.get('start');
  const urlEnd = searchParams.get('end');
  const [preset, setPreset] = useState<DatePreset>(urlStart ? 'Custom' : 'This Month');
  const resolved = resolvePreset(preset);
  const start = urlStart && preset === 'Custom' ? new Date(urlStart) : resolved.start;
  const end = urlEnd && preset === 'Custom' ? new Date(urlEnd) : resolved.end;
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const { data: detail } = useSWR(['at-detail', startIso, endIso], () => reportsApi.getAverageTicketDetail(startIso, endIso));
  const { data: byService } = useSWR(['at-service', startIso, endIso], () => reportsApi.getAverageTicketByService(startIso, endIso));
  const { data: byTechnician } = useSWR(['at-tech', startIso, endIso], () => reportsApi.getRevenueByTechnician(startIso, endIso));

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/reports" className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">← Owner Scorecard</Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Average Ticket</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Completed Job Revenue ÷ Completed Jobs — see REPORTING_DEFINITIONS.md for why this is job-based, not estimate-based.</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
          {DATE_PRESETS.filter((p) => p !== 'Custom').map((p) => (
            <button key={p} onClick={() => { setPreset(p); router.replace('/reports/average-ticket'); }}
              className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium', preset === p ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400')}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Average Ticket" value={money(detail?.averageTicket)} highlight />
        <Kpi label="Completed Jobs" value={detail?.completedJobs ?? '—'} />
        <Kpi label="Total Revenue" value={money(detail?.totalRevenue)} />
        <Kpi label="Median Ticket" value={money(detail?.medianTicket)} />
        <Kpi label="Highest Ticket" value={money(detail?.highestTicket)} />
        <Kpi label="Lowest Ticket" value={money(detail?.lowestTicket)} />
      </div>

      {detail && detail.completedJobs === 0 && (
        <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-500 dark:text-slate-400">
          No completed jobs in this date range.
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">By Service</h2>
          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">A job's price is attributed to its primary service — the same one JobsService records at creation, not a per-line split.</p>
          <div className="mt-3 overflow-x-auto">
            {!byService ? (
              <div className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            ) : byService.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">No completed jobs in this period.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-slate-400 dark:text-slate-500">
                  <tr><th className="pb-1.5 text-left font-medium">Service</th><th className="pb-1.5 text-right font-medium">Jobs</th><th className="pb-1.5 text-right font-medium">Avg Ticket</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {byService.map((row, i) => (
                    <tr key={i}>
                      <td className="py-1.5 text-slate-700 dark:text-slate-300">{row.serviceName}</td>
                      <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{row.jobsCompleted}</td>
                      <td className="py-1.5 text-right font-medium text-slate-900 dark:text-slate-100">{money(row.averageTicket)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">By Technician</h2>
          <div className="mt-3 overflow-x-auto">
            {!byTechnician ? (
              <div className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            ) : byTechnician.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">No completed jobs with an assigned technician in this period.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-slate-400 dark:text-slate-500">
                  <tr><th className="pb-1.5 text-left font-medium">Technician</th><th className="pb-1.5 text-right font-medium">Jobs</th><th className="pb-1.5 text-right font-medium">Avg Ticket</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {byTechnician.map((row) => (
                    <tr key={row.technicianId}>
                      <td className="py-1.5 text-slate-700 dark:text-slate-300">{row.firstName} {row.lastName}</td>
                      <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{row.jobsCompleted}</td>
                      <td className="py-1.5 text-right font-medium text-slate-900 dark:text-slate-100">{money(row.averageTicket)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* New-vs-repeat-customer breakdown, per the original brief, is
          deliberately not built here — accurately computing it requires
          knowing whether each completed job's customer had any earlier
          completed job, which needs its own real query, not an
          approximation. Flagged as a real gap, not silently skipped. */}
      <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
        New vs. repeat customer breakdown — not yet available. Requires its own dedicated query, not built in this pass.
      </div>
    </main>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={cn('rounded-xl border p-3', highlight ? 'border-[var(--color-brand)]/30 bg-[var(--color-brand)]/[0.04]' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900')}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

export default function AverageTicketPage() {
  return (
    <Suspense fallback={null}>
      <AverageTicketInner />
    </Suspense>
  );
}
