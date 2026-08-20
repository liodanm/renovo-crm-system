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

function EstimateConversionInner() {
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

  const { data: detail } = useSWR(['ec-detail', startIso, endIso], () => reportsApi.getEstimateConversionDetail(startIso, endIso));
  const { data: byService } = useSWR(['ec-service', startIso, endIso], () => reportsApi.getEstimateConversionByService(startIso, endIso));
  const { data: byLeadSource } = useSWR(['ec-lead', startIso, endIso], () => reportsApi.getLeadSourceAnalytics(startIso, endIso));

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/reports" className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">← Owner Scorecard</Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Estimate Conversion</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Which quotes turn into work, and how much are we losing when they don't?</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
          {DATE_PRESETS.filter((p) => p !== 'Custom').map((p) => (
            <button key={p} onClick={() => { setPreset(p); router.replace('/reports/estimate-conversion'); }}
              className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium', preset === p ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400')}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Estimates are grouped by created_at throughout this page, including
          "average days to acceptance" — a deliberate, documented choice (see
          REPORTING_DEFINITIONS.md and the backend comment on
          getEstimateConversionDetail) so every figure on this one page shares
          a single date basis rather than silently mixing bases. */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Total Estimates" value={detail?.total ?? '—'} />
        <Kpi label="Accepted" value={detail?.accepted ?? '—'} tone="good" />
        <Kpi label="Declined" value={detail?.declined ?? '—'} tone="bad" />
        <Kpi label="Pending" value={detail?.pending ?? '—'} />
        <Kpi label="Expired" value={detail?.expired ?? '—'} />
        <Kpi label="Conversion Rate" value={detail?.conversionRatePercent != null ? `${detail.conversionRatePercent}%` : '—'} />
        <Kpi label="Accepted Value" value={money(detail?.acceptedValue)} />
        <Kpi label="Lost Value" value={money(detail?.lostValue)} sub="Declined + expired" tone="bad" />
        <Kpi label="Avg Accepted Value" value={money(detail?.averageAcceptedValue)} />
        <Kpi label="Avg Days to Accept" value={detail ? `${detail.averageDaysToAcceptance}d` : '—'} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">By Service</h2>
          <div className="mt-3 overflow-x-auto">
            {!byService ? (
              <div className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            ) : byService.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">No estimates in this period.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-slate-400 dark:text-slate-500">
                  <tr><th className="pb-1.5 text-left font-medium">Service</th><th className="pb-1.5 text-right font-medium">Total</th><th className="pb-1.5 text-right font-medium">Accepted</th><th className="pb-1.5 text-right font-medium">Rate</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {byService.map((row, i) => {
                    const total = Number(row.total);
                    const accepted = Number(row.accepted);
                    const rate = total > 0 ? Math.round((accepted / total) * 1000) / 10 : null;
                    return (
                      <tr key={i}>
                        <td className="py-1.5 text-slate-700 dark:text-slate-300">{row.serviceName}</td>
                        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{row.total}</td>
                        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{row.accepted}</td>
                        <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{rate != null ? `${rate}%` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">By Lead Source</h2>
          <div className="mt-3 overflow-x-auto">
            {!byLeadSource ? (
              <div className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            ) : byLeadSource.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">No lead source data in this period.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-slate-400 dark:text-slate-500">
                  <tr><th className="pb-1.5 text-left font-medium">Source</th><th className="pb-1.5 text-right font-medium">Leads</th><th className="pb-1.5 text-right font-medium">Converted</th><th className="pb-1.5 text-right font-medium">Revenue</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {byLeadSource.map((row, i) => (
                    <tr key={i}>
                      <td className="py-1.5 text-slate-700 dark:text-slate-300">{row.source}</td>
                      <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{row.leadCount}</td>
                      <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{row.convertedCount}</td>
                      <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{money(row.totalRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Drill-down. Only "accepted" links to a real, working filtered
          view — the existing Estimates page's own filter model only
          supports needsResponse/accepted/all (no declined/expired
          filter exists there today), so declined/expired are shown as
          plain counts rather than fake links that would silently land
          on the unfiltered list. Extending that page's filter model is
          real, separate follow-up work, not done here. */}
      <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">See the underlying estimates</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Link href={`/estimates?status=accepted`} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-[var(--color-brand)]">
            View accepted ({detail?.accepted ?? '—'})
          </Link>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Declined ({detail?.declined ?? '—'}) and expired ({detail?.expired ?? '—'}) aren't independently filterable on the Estimates list yet — only the total count is shown here.
          </span>
        </div>
      </div>
    </main>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold', tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100')}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}

export default function EstimateConversionPage() {
  return (
    <Suspense fallback={null}>
      <EstimateConversionInner />
    </Suspense>
  );
}
