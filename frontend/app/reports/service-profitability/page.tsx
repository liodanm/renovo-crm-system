'use client';

import { Suspense, useState } from 'react';
import useSWR from 'swr';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { reportsApi, resolvePreset, DATE_PRESETS, type DatePreset, type ServiceProfitabilityRow } from '../../../lib/api/reports';
import { cn } from '../../../lib/utils';

function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

type SortKey = 'revenue' | 'actualCost' | 'grossProfit' | 'grossMarginPercent' | 'totalJobs' | 'averageTicket';

function ServiceProfitabilityInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStart = searchParams.get('start');
  const [preset, setPreset] = useState<DatePreset>(urlStart ? 'Custom' : 'This Month');
  const resolved = resolvePreset(preset);
  const start = resolved.start;
  const end = resolved.end;
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [sortKey, setSortKey] = useState<SortKey>('grossProfit'); // default: gross profit descending, per the spec's own stated priority question
  const [expandedService, setExpandedService] = useState<string | null>(null);

  const { data: rows, error, isLoading } = useSWR(['service-profitability', startIso, endIso], () => reportsApi.getServiceProfitability(startIso, endIso));
  const { data: drilldown, isLoading: isDrilldownLoading } = useSWR(
    expandedService ? ['service-profitability-detail', startIso, endIso, expandedService] : null,
    () => reportsApi.getServiceProfitabilityDetail(startIso, endIso, expandedService!),
  );

  const sorted = rows ? [...rows].sort((a, b) => Number(b[sortKey] ?? 0) - Number(a[sortKey] ?? 0)) : undefined;

  // Backend-computed summary — never re-derived from the per-service
  // rows in React beyond a plain sum, and even that sum only ever
  // touches numbers the backend already returned (never re-deriving
  // cost/margin logic client-side).
  const totals = rows?.reduce(
    (acc, r) => ({
      revenue: acc.revenue + Number(r.revenue),
      actualCost: acc.actualCost + Number(r.actualCost),
      grossProfit: acc.grossProfit + Number(r.grossProfit),
      completedJobs: acc.completedJobs + Number(r.totalJobs),
      jobsWithCostData: acc.jobsWithCostData + Number(r.jobsWithCostData),
    }),
    { revenue: 0, actualCost: 0, grossProfit: 0, completedJobs: 0, jobsWithCostData: 0 },
  );
  const overallMargin = totals && totals.revenue > 0 ? Math.round((totals.grossProfit / totals.revenue) * 1000) / 10 : null;
  const costCoveragePercent = totals && totals.completedJobs > 0 ? Math.round((totals.jobsWithCostData / totals.completedJobs) * 100) : null;

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/reports" className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">← Owner Scorecard</Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Service Profitability</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Which services actually make the most money — by real, actual job cost, not estimates.</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
          {DATE_PRESETS.filter((p) => p !== 'Custom').map((p) => (
            <button key={p} onClick={() => { setPreset(p); router.replace('/reports/service-profitability'); }}
              className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium', preset === p ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400')}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Revenue/Cost/Profit/Margin here reflect only jobs with real
          actual-cost data — same basis Job Cost & Gross Margin already
          uses, never blended with jobs missing cost data. Completed
          Jobs and Cost Data Coverage are the honest, separate,
          unrestricted denominators. */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Total Revenue" value={money(totals?.revenue)} />
        <Kpi label="Actual Direct Cost" value={money(totals?.actualCost)} />
        <Kpi label="Gross Profit" value={money(totals?.grossProfit)} highlight />
        <Kpi label="Gross Margin" value={overallMargin != null ? `${overallMargin}%` : '—'} />
        <Kpi label="Completed Jobs" value={totals?.completedJobs ?? '—'} />
        <Kpi label="Cost Data Coverage" value={costCoveragePercent != null ? `${costCoveragePercent}%` : '—'} sub={totals ? `${totals.jobsWithCostData} of ${totals.completedJobs} jobs` : undefined} />
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">By Service</h2>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs dark:bg-slate-900 dark:text-slate-100">
            <option value="grossProfit">Sort: Gross Profit</option>
            <option value="revenue">Sort: Revenue</option>
            <option value="actualCost">Sort: Actual Cost</option>
            <option value="grossMarginPercent">Sort: Gross Margin</option>
            <option value="totalJobs">Sort: Job Count</option>
            <option value="averageTicket">Sort: Average Ticket</option>
          </select>
        </div>

        <div className="mt-3 overflow-x-auto">
          {isLoading && <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />}
          {error && !isLoading && <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">We couldn't load service profitability right now. Please try refreshing.</p>}
          {!isLoading && !error && sorted?.length === 0 && <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No completed jobs found for this period.</p>}

          {!isLoading && !error && sorted && sorted.length > 0 && (
            <table className="w-full min-w-[720px] text-xs">
              <thead className="text-slate-400 dark:text-slate-500">
                <tr>
                  <th className="pb-1.5 text-left font-medium"></th>
                  <th className="pb-1.5 text-left font-medium">Service</th>
                  <th className="pb-1.5 text-right font-medium">Jobs</th>
                  <th className="pb-1.5 text-right font-medium">Cost Data</th>
                  <th className="pb-1.5 text-right font-medium">Revenue</th>
                  <th className="pb-1.5 text-right font-medium">Actual Cost</th>
                  <th className="pb-1.5 text-right font-medium">Gross Profit</th>
                  <th className="pb-1.5 text-right font-medium">Margin</th>
                  <th className="pb-1.5 text-right font-medium">Avg Ticket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sorted.map((row) => (
                  <ServiceRow
                    key={row.serviceName}
                    row={row}
                    expanded={expandedService === row.serviceName}
                    onToggle={() => setExpandedService(expandedService === row.serviceName ? null : row.serviceName)}
                    drilldown={expandedService === row.serviceName ? drilldown : undefined}
                    isDrilldownLoading={expandedService === row.serviceName && isDrilldownLoading}
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

function ServiceRow({
  row,
  expanded,
  onToggle,
  drilldown,
  isDrilldownLoading,
}: {
  row: ServiceProfitabilityRow;
  expanded: boolean;
  onToggle: () => void;
  drilldown: any[] | undefined;
  isDrilldownLoading: boolean;
}) {
  const incomplete = Number(row.jobsWithCostData) < Number(row.totalJobs);
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <td className="py-1.5 pl-1 text-slate-400">{expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</td>
        <td className="py-1.5 font-medium text-slate-900 dark:text-slate-100">{row.serviceName}</td>
        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{row.totalJobs}</td>
        <td className={cn('py-1.5 text-right', incomplete ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300')}>
          {row.jobsWithCostData}/{row.totalJobs}
        </td>
        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{money(row.revenue)}</td>
        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{money(row.actualCost)}</td>
        <td className="py-1.5 text-right font-medium text-slate-900 dark:text-slate-100">{money(row.grossProfit)}</td>
        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{row.grossMarginPercent != null ? `${row.grossMarginPercent}%` : '—'}</td>
        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{money(row.averageTicket)}</td>
      </tr>
      {incomplete && !expanded && (
        <tr>
          <td colSpan={9} className="pb-1 pl-6 text-[11px] text-amber-600 dark:text-amber-400">
            Actual cost data available for {row.jobsWithCostData} of {row.totalJobs} completed jobs — figures above reflect only those jobs.
          </td>
        </tr>
      )}
      {expanded && (
        <tr>
          <td colSpan={9} className="bg-slate-50 dark:bg-slate-800/50 px-2 py-3">
            {isDrilldownLoading && <div className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />}
            {!isDrilldownLoading && drilldown && drilldown.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">No jobs found.</p>}
            {!isDrilldownLoading && drilldown && drilldown.length > 0 && (
              <table className="w-full text-[11px]">
                <thead className="text-slate-400 dark:text-slate-500">
                  <tr>
                    <th className="pb-1 text-left font-medium">Job</th>
                    <th className="pb-1 text-left font-medium">Customer</th>
                    <th className="pb-1 text-left font-medium">Date</th>
                    <th className="pb-1 text-right font-medium">Revenue</th>
                    <th className="pb-1 text-right font-medium">Actual Cost</th>
                    <th className="pb-1 text-right font-medium">Gross Profit</th>
                    <th className="pb-1 text-right font-medium">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {drilldown.map((j) => (
                    <tr key={j.jobId}>
                      <td className="py-1"><Link href={`/jobs/${j.jobId}`} className="text-[var(--color-brand)] hover:underline">{j.jobNumber}</Link></td>
                      <td className="py-1 text-slate-700 dark:text-slate-300">{j.customerName}</td>
                      <td className="py-1 text-slate-500 dark:text-slate-400">{new Date(j.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                      <td className="py-1 text-right text-slate-700 dark:text-slate-300">{money(j.revenue)}</td>
                      <td className="py-1 text-right text-slate-700 dark:text-slate-300">{j.hasActualCostData ? money(j.actualCost) : <span className="text-amber-600 dark:text-amber-400">No cost data</span>}</td>
                      <td className="py-1 text-right text-slate-700 dark:text-slate-300">{j.hasActualCostData ? money(j.grossProfit) : '—'}</td>
                      <td className="py-1 text-right text-slate-700 dark:text-slate-300">{j.hasActualCostData && j.grossMarginPercent != null ? `${j.grossMarginPercent}%` : '—'}</td>
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

function Kpi({ label, value, sub, highlight }: { label: string; value: React.ReactNode; sub?: string; highlight?: boolean }) {
  return (
    <div className={cn('rounded-xl border p-3', highlight ? 'border-[var(--color-brand)]/30 bg-[var(--color-brand)]/[0.04]' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900')}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}

export default function ServiceProfitabilityPage() {
  return (
    <Suspense fallback={null}>
      <ServiceProfitabilityInner />
    </Suspense>
  );
}
