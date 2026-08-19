'use client';

import { Suspense, useState } from 'react';
import useSWR from 'swr';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { AppShell } from '../../../components/layout/AppShell';
import { reportsApi, resolvePreset, exportToCsv, DATE_PRESETS, type DatePreset } from '../../../lib/api/reports';
import { cn } from '../../../lib/utils';

function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function JobCostReportInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Arriving from the Owner Scorecard's click-through carries the exact
  // same date range forward via the URL — per the approval doc's own
  // "clicking a KPI should navigate with the same date range applied"
  // requirement. Falls back to This Month if opened directly.
  const urlStart = searchParams.get('start');
  const urlEnd = searchParams.get('end');
  const [preset, setPreset] = useState<DatePreset>(urlStart ? 'Custom' : 'This Month');
  const resolved = resolvePreset(preset);
  const start = urlStart && preset === 'Custom' ? new Date(urlStart) : resolved.start;
  const end = urlEnd && preset === 'Custom' ? new Date(urlEnd) : resolved.end;
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  type SortKey = 'grossProfit' | 'revenue' | 'actualCost' | 'grossMarginPercent';
  const [sortKey, setSortKey] = useState<SortKey>('grossProfit');
  const [sortAsc, setSortAsc] = useState(true); // ascending by grossProfit by default = worst-performing jobs first, the actual point of this report per the approval doc ("Where did the money go?")

  const { data: summary } = useSWR(['jobcost-summary', startIso, endIso], () => reportsApi.getJobCostSummary(startIso, endIso));
  const { data: detail } = useSWR(['jobcost-detail', startIso, endIso], () => reportsApi.getJobCostDetail(startIso, endIso));

  const sorted = detail
    ? [...detail].sort((a, b) => {
        const av = Number(a[sortKey] ?? 0);
        const bv = Number(b[sortKey] ?? 0);
        return sortAsc ? av - bv : bv - av;
      })
    : undefined;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/reports" className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">← Owner Scorecard</Link>
            <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Job Cost & Gross Margin</h1>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
            {DATE_PRESETS.filter((p) => p !== 'Custom').map((p) => (
              <button
                key={p}
                onClick={() => { setPreset(p); router.replace('/reports/job-cost'); }}
                className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium', preset === p ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400')}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Data completeness banner — never letting the table's numbers look more authoritative than they are, per the approval doc's explicit "Actual cost available for 83 of 91 completed jobs" example. */}
        {summary && (
          <div className={cn(
            'mt-4 rounded-lg px-4 py-2.5 text-sm',
            summary.completedJobs === 0 ? 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              : summary.jobsWithCostData === summary.completedJobs ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300',
          )}>
            {summary.completedJobs === 0
              ? 'No completed jobs in this date range.'
              : summary.jobsWithCostData === 0
                ? `No actual cost data has been recorded for any of the ${summary.completedJobs} completed jobs in this period.`
                : `Actual cost data available for ${summary.jobsWithCostData} of ${summary.completedJobs} completed jobs${summary.completeJobs < summary.jobsWithCostData ? ` (${summary.completeJobs} fully complete, ${summary.jobsWithCostData - summary.completeJobs} partial)` : ''}.`}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Revenue" value={money(summary?.totalRevenue)} />
          <SummaryCard label="Actual Cost" value={money(summary?.totalActualCost)} />
          <SummaryCard label="Gross Profit" value={money(summary?.totalGrossProfit)} tone={summary?.totalGrossProfit != null && summary.totalGrossProfit < 0 ? 'danger' : undefined} />
          <SummaryCard label="Gross Margin" value={summary?.grossMarginPercent != null ? `${summary.grossMarginPercent}%` : '—'} />
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Jobs with actual cost data</h2>
            {sorted && sorted.length > 0 && (
              <button onClick={() => exportToCsv('job-cost-detail', sorted)} className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
            )}
          </div>

          {!sorted || sorted.length === 0 ? (
            <div className="flex h-[160px] items-center justify-center text-sm text-slate-400 dark:text-slate-500">
              {summary && summary.completedJobs > 0
                ? 'No jobs in this period have any actual cost recorded yet — record actual costs on a completed job to see it here.'
                : 'No completed jobs in this date range.'}
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-400 dark:text-slate-500">
                  <tr>
                    <th className="pb-1.5 text-left font-medium">Job</th>
                    <th className="pb-1.5 text-left font-medium">Customer</th>
                    <SortableHeader label="Revenue" active={sortKey === 'revenue'} asc={sortAsc} onClick={() => toggleSort('revenue')} />
                    <SortableHeader label="Actual Cost" active={sortKey === 'actualCost'} asc={sortAsc} onClick={() => toggleSort('actualCost')} />
                    <SortableHeader label="Gross Profit" active={sortKey === 'grossProfit'} asc={sortAsc} onClick={() => toggleSort('grossProfit')} />
                    <SortableHeader label="Margin" active={sortKey === 'grossMarginPercent'} asc={sortAsc} onClick={() => toggleSort('grossMarginPercent')} />
                    <th className="pb-1.5 text-left font-medium">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sorted.map((job) => (
                    <tr key={job.jobId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-1.5">
                        <Link href={`/jobs/${job.jobId}`} className="text-[var(--color-brand)] hover:underline">{job.jobNumber}</Link>
                      </td>
                      <td className="py-1.5 text-slate-700 dark:text-slate-300">{job.customerName}</td>
                      <td className="py-1.5 text-slate-700 dark:text-slate-300">{money(job.revenue)}</td>
                      <td className="py-1.5 text-slate-700 dark:text-slate-300">{money(job.actualCost)}</td>
                      <td className={cn('py-1.5 font-medium', Number(job.grossProfit) < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300')}>{money(job.grossProfit)}</td>
                      <td className="py-1.5 text-slate-700 dark:text-slate-300">{job.grossMarginPercent != null ? `${job.grossMarginPercent}%` : '—'}</td>
                      <td className="py-1.5">
                        {job.isComplete
                          ? <span className="rounded-full bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">Complete</span>
                          : <span className="rounded-full bg-amber-50 dark:bg-amber-950 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">Partial</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}

export default function JobCostReportPage() {
  return (
    <Suspense fallback={null}>
      <JobCostReportInner />
    </Suspense>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold', tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100')}>{value}</p>
    </div>
  );
}

function SortableHeader({ label, active, asc, onClick }: { label: string; active: boolean; asc: boolean; onClick: () => void }) {
  return (
    <th className="pb-1.5 text-left font-medium">
      <button onClick={onClick} className={cn('flex items-center gap-0.5', active ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600')}>
        {label} {active && (asc ? '↑' : '↓')}
      </button>
    </th>
  );
}
