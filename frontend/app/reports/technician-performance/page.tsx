'use client';

import { Suspense, useState } from 'react';
import useSWR from 'swr';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { reportsApi, resolvePreset, DATE_PRESETS, type DatePreset, type TechnicianPerformanceRow } from '../../../lib/api/reports';
import { cn } from '../../../lib/utils';

function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type SortKey = 'totalJobs' | 'revenue' | 'averageTicket' | 'laborHours' | 'revenuePerLaborHour' | 'grossProfit' | 'grossMarginPercent' | 'callbackRatePercent';

function TechnicianPerformanceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStart = searchParams.get('start');
  const [preset, setPreset] = useState<DatePreset>(urlStart ? 'Custom' : 'This Month');
  const resolved = resolvePreset(preset);
  const startIso = resolved.start.toISOString();
  const endIso = resolved.end.toISOString();
  const [sortKey, setSortKey] = useState<SortKey>('grossProfit');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: rows, error, isLoading } = useSWR(['tech-perf', startIso, endIso], () => reportsApi.getTechnicianPerformanceDetail(startIso, endIso));
  const { data: drilldown, isLoading: drilldownLoading } = useSWR(
    expandedId ? ['tech-perf-detail', startIso, endIso, expandedId] : null,
    () => reportsApi.getTechnicianPerformanceDrilldown(startIso, endIso, expandedId!),
  );

  const sorted = rows ? [...rows].sort((a, b) => Number(b[sortKey] ?? 0) - Number(a[sortKey] ?? 0)) : undefined;

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/settings/reports" className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">← Reports</Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Technician Performance</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Which technicians are completing jobs efficiently and profitably.</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
          {DATE_PRESETS.filter((p) => p !== 'Custom').map((p) => (
            <button key={p} onClick={() => { setPreset(p); router.replace('/reports/technician-performance'); }}
              className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium', preset === p ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400')}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Labor Hours here is jobs.billable_labor_hours (time-clock
          derived at job completion) — a different, job-level field from
          the per-line-item actual_labor_hours used for Gross
          Profit/Margin. Revenue/Cost/Profit/Margin/Avg Ticket reflect
          only jobs with real actual-cost data (same basis as Job Cost &
          Service Profitability); Labor Hours reflects only jobs with
          billable_labor_hours recorded — two independent completeness
          questions, tracked separately below. */}
      <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
        Revenue, cost, profit, and margin reflect only completed jobs with recorded actual-cost data. Labor hours reflect only jobs with recorded billable hours. These are tracked as two separate completeness questions.
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">By Technician</h2>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs dark:bg-slate-900 dark:text-slate-100">
            <option value="grossProfit">Sort: Gross Profit</option>
            <option value="totalJobs">Sort: Jobs</option>
            <option value="revenue">Sort: Revenue</option>
            <option value="averageTicket">Sort: Average Ticket</option>
            <option value="laborHours">Sort: Labor Hours</option>
            <option value="revenuePerLaborHour">Sort: Revenue/Labor Hour</option>
            <option value="grossMarginPercent">Sort: Gross Margin</option>
            <option value="callbackRatePercent">Sort: Callback Rate</option>
          </select>
        </div>

        <div className="mt-3 overflow-x-auto">
          {isLoading && <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />}
          {error && !isLoading && <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">We couldn't load technician performance right now. Please try refreshing.</p>}
          {!isLoading && !error && sorted?.length === 0 && <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No completed jobs with an assigned technician in this period.</p>}

          {!isLoading && !error && sorted && sorted.length > 0 && (
            <table className="w-full min-w-[840px] text-xs">
              <thead className="text-slate-400 dark:text-slate-500">
                <tr>
                  <th className="pb-1.5"></th>
                  <th className="pb-1.5 text-left font-medium">Technician</th>
                  <th className="pb-1.5 text-right font-medium">Jobs</th>
                  <th className="pb-1.5 text-right font-medium">Revenue</th>
                  <th className="pb-1.5 text-right font-medium">Avg Ticket</th>
                  <th className="pb-1.5 text-right font-medium">Labor Hours</th>
                  <th className="pb-1.5 text-right font-medium">Rev/Hour</th>
                  <th className="pb-1.5 text-right font-medium">Gross Profit</th>
                  <th className="pb-1.5 text-right font-medium">Margin</th>
                  <th className="pb-1.5 text-right font-medium">Callback Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sorted.map((row) => (
                  <TechRow
                    key={row.technicianId}
                    row={row}
                    expanded={expandedId === row.technicianId}
                    onToggle={() => setExpandedId(expandedId === row.technicianId ? null : row.technicianId)}
                    drilldown={expandedId === row.technicianId ? drilldown : undefined}
                    drilldownLoading={expandedId === row.technicianId && drilldownLoading}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}

function TechRow({
  row,
  expanded,
  onToggle,
  drilldown,
  drilldownLoading,
}: {
  row: TechnicianPerformanceRow;
  expanded: boolean;
  onToggle: () => void;
  drilldown: any[] | undefined;
  drilldownLoading: boolean;
}) {
  const laborIncomplete = Number(row.jobsWithLaborData) < Number(row.totalJobs);
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <td className="py-1.5 pl-1 text-slate-400">{expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</td>
        <td className="py-1.5 font-medium text-slate-900 dark:text-slate-100">{row.firstName} {row.lastName}</td>
        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{row.totalJobs}</td>
        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{money(row.revenue)}</td>
        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{money(row.averageTicket)}</td>
        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">
          {Number(row.jobsWithLaborData) > 0 ? Number(row.laborHours).toFixed(1) : 'Not Yet Available'}
        </td>
        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{row.revenuePerLaborHour != null ? money(row.revenuePerLaborHour) : 'Not Yet Available'}</td>
        <td className="py-1.5 text-right font-medium text-slate-900 dark:text-slate-100">{money(row.grossProfit)}</td>
        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{row.grossMarginPercent != null ? `${row.grossMarginPercent}%` : '—'}</td>
        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{row.callbackRatePercent != null ? `${row.callbackRatePercent}%` : '—'}</td>
      </tr>
      {laborIncomplete && !expanded && (
        <tr>
          <td colSpan={10} className="pb-1 pl-6 text-[11px] text-amber-600 dark:text-amber-400">
            Labor hours recorded for {row.jobsWithLaborData} of {row.totalJobs} jobs — Labor Hours/Rev per Hour reflect only those jobs.
          </td>
        </tr>
      )}
      {expanded && (
        <tr>
          <td colSpan={10} className="bg-slate-50 dark:bg-slate-800/50 px-2 py-3">
            {drilldownLoading && <div className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />}
            {!drilldownLoading && drilldown && drilldown.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">No jobs found.</p>}
            {!drilldownLoading && drilldown && drilldown.length > 0 && (
              <table className="w-full text-[11px]">
                <thead className="text-slate-400 dark:text-slate-500">
                  <tr>
                    <th className="pb-1 text-left font-medium">Job</th>
                    <th className="pb-1 text-left font-medium">Customer</th>
                    <th className="pb-1 text-left font-medium">Service</th>
                    <th className="pb-1 text-left font-medium">Date</th>
                    <th className="pb-1 text-right font-medium">Revenue</th>
                    <th className="pb-1 text-right font-medium">Gross Profit</th>
                    <th className="pb-1 text-right font-medium">Margin</th>
                    <th className="pb-1 text-left font-medium">Callback</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {drilldown.map((j) => (
                    <tr key={j.jobId}>
                      <td className="py-1"><Link href={`/jobs/${j.jobId}`} className="text-[var(--color-brand)] hover:underline">{j.jobNumber}</Link></td>
                      <td className="py-1 text-slate-700 dark:text-slate-300">{j.customerName}</td>
                      <td className="py-1 text-slate-700 dark:text-slate-300">{j.serviceName}</td>
                      <td className="py-1 text-slate-500 dark:text-slate-400">{fmtDate(j.completedAt)}</td>
                      <td className="py-1 text-right text-slate-700 dark:text-slate-300">{money(j.revenue)}</td>
                      <td className="py-1 text-right text-slate-700 dark:text-slate-300">{j.hasActualCostData ? money(j.grossProfit) : <span className="text-amber-600 dark:text-amber-400">No cost data</span>}</td>
                      <td className="py-1 text-right text-slate-700 dark:text-slate-300">{j.hasActualCostData && j.grossMarginPercent != null ? `${j.grossMarginPercent}%` : '—'}</td>
                      <td className="py-1 text-slate-500 dark:text-slate-400">{j.hadCallback ? 'Yes' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function TechnicianPerformancePage() {
  return (
    <Suspense fallback={null}>
      <TechnicianPerformanceInner />
    </Suspense>
  );
}
