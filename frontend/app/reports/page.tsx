'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { reportsApi, resolvePreset, resolveComparisonPeriod, percentChange, DATE_PRESETS, type DatePreset } from '../../lib/api/reports';
import { cn } from '../../lib/utils';

function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function OwnerScorecardPage() {
  const router = useRouter();
  const [preset, setPreset] = useState<DatePreset>('This Month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const { start, end } = resolvePreset(preset, customStart ? new Date(customStart) : undefined, customEnd ? new Date(customEnd) : undefined);
  const { start: prevStart, end: prevEnd } = resolveComparisonPeriod(start, end, preset);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const prevStartIso = prevStart.toISOString();
  const prevEndIso = prevEnd.toISOString();

  function goToDetail(path: string) {
    router.push(`${path}?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`);
  }

  const { data: kpis } = useSWR(['scorecard-kpis', startIso, endIso], () => reportsApi.getPeriodKpis(startIso, endIso));
  const { data: prevKpis } = useSWR(['scorecard-kpis-prev', prevStartIso, prevEndIso], () => reportsApi.getPeriodKpis(prevStartIso, prevEndIso));
  // Reporting verification gate, Decision 2: the Owner Scorecard's
  // primary revenue KPI is Collected Revenue (successfully collected
  // payments), never Invoiced Revenue (money billed but not
  // necessarily paid) — getPaymentTrend() already implements exactly
  // this (status='succeeded', date = COALESCE(payment_date,
  // processed_at)), reused here rather than a second implementation.
  // getRevenueTrend() (invoice-based) remains available in /reports/all
  // for whoever specifically wants Invoiced Revenue — untouched, not
  // deleted, just no longer what the Owner Scorecard's "Revenue" card means.
  const { data: collectedTrend } = useSWR(['scorecard-collected', startIso, endIso], () => reportsApi.getPaymentTrend(startIso, endIso));
  const { data: prevCollectedTrend } = useSWR(['scorecard-collected-prev', prevStartIso, prevEndIso], () => reportsApi.getPaymentTrend(prevStartIso, prevEndIso));
  const { data: jobCost } = useSWR(['scorecard-jobcost', startIso, endIso], () => reportsApi.getJobCostSummary(startIso, endIso));
  const { data: prevJobCost } = useSWR(['scorecard-jobcost-prev', prevStartIso, prevEndIso], () => reportsApi.getJobCostSummary(prevStartIso, prevEndIso));
  const { data: customerAnalytics } = useSWR('scorecard-customers', () => reportsApi.getCustomerAnalytics());
  const { data: aging } = useSWR('scorecard-aging', () => reportsApi.getReceivablesAging());
  const { data: callbackRate } = useSWR(['scorecard-callbacks', startIso, endIso], () => reportsApi.getCallbackRate(startIso, endIso));
  const { data: prevCallbackRate } = useSWR(['scorecard-callbacks-prev', prevStartIso, prevEndIso], () => reportsApi.getCallbackRate(prevStartIso, prevEndIso));
  const { data: satisfaction } = useSWR(['scorecard-satisfaction', startIso, endIso], () => reportsApi.getCustomerSatisfaction(startIso, endIso));

  const revenue = collectedTrend?.reduce((sum, p) => sum + Number(p.amount ?? 0), 0) ?? null;
  const prevRevenue = prevCollectedTrend?.reduce((sum, p) => sum + Number(p.amount ?? 0), 0) ?? null;
  const agingData = aging?.[0];
  const arOutstanding = agingData ? Number(agingData.current) + Number(agingData.days1To30) + Number(agingData.days31To60) + Number(agingData.days60Plus) : null;
  const arOverdue = agingData ? Number(agingData.days1To30) + Number(agingData.days31To60) + Number(agingData.days60Plus) : null;

  return (
    <AppShell>
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Owner Scorecard</h1>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              How the business is doing right now, compared with the equivalent period before it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium', preset === p ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400')}
                >
                  {p}
                </button>
              ))}
            </div>
            {preset === 'Custom' && (
              <div className="flex items-center gap-1.5">
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-xs dark:bg-slate-900 dark:text-slate-100" />
                <span className="text-xs text-slate-400 dark:text-slate-500">to</span>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-xs dark:bg-slate-900 dark:text-slate-100" />
              </div>
            )}
          </div>
        </div>

        {/* Priority order matches the approval doc exactly: Collected Revenue, Gross Profit, Gross Margin, Jobs, Average Ticket, Estimate Conversion, Repeat Customer %, Recurring Revenue, Callback Rate, AR Outstanding. */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <ScorecardKpi
            label="Collected Revenue"
            value={money(revenue)}
            current={revenue}
            previous={prevRevenue}
            onClick={() => goToDetail('/reports/all')}
          />
          <ScorecardKpi
            label="Gross Profit"
            value={money(jobCost?.totalGrossProfit)}
            current={jobCost?.totalGrossProfit ?? null}
            previous={prevJobCost?.totalGrossProfit ?? null}
            subtitle={jobCost ? `${jobCost.jobsWithCostData} of ${jobCost.completedJobs} jobs have cost data` : undefined}
            onClick={() => goToDetail('/reports/job-cost')}
          />
          <ScorecardKpi
            label="Gross Margin"
            value={jobCost?.grossMarginPercent != null ? `${jobCost.grossMarginPercent}%` : '—'}
            current={jobCost?.grossMarginPercent ?? null}
            previous={prevJobCost?.grossMarginPercent ?? null}
            isPercent
            onClick={() => goToDetail('/reports/job-cost')}
          />
          <ScorecardKpi
            label="Jobs Completed"
            value={kpis?.jobsCompleted ?? '—'}
            current={kpis ? Number(kpis.jobsCompleted) : null}
            previous={prevKpis ? Number(prevKpis.jobsCompleted) : null}
            onClick={() => goToDetail('/reports/all')}
          />
          <ScorecardKpi
            label="Average Ticket"
            value={money(kpis?.averageTicket)}
            current={kpis ? Number(kpis.averageTicket) : null}
            previous={prevKpis ? Number(prevKpis.averageTicket) : null}
            onClick={() => goToDetail('/reports/all')}
          />
          <ScorecardKpi
            label="Estimate Conversion"
            value={kpis?.estimateConversionRatePercent != null ? `${kpis.estimateConversionRatePercent}%` : '—'}
            current={kpis?.estimateConversionRatePercent ?? null}
            previous={prevKpis?.estimateConversionRatePercent ?? null}
            isPercent
            onClick={() => goToDetail('/reports/all')}
          />
          <ScorecardKpi
            label="Repeat Customer %"
            value={customerAnalytics?.repeatCustomerRatePercent != null ? `${customerAnalytics.repeatCustomerRatePercent}%` : '—'}
            subtitle="All-time — not period-bound"
            onClick={() => goToDetail('/reports/all')}
          />
          <ScorecardKpi
            label="Recurring Revenue"
            value="Not yet available"
            subtitle="Renovo doesn't track active recurring service plans yet"
            muted
          />
          <ScorecardKpi
            label="Callback Rate"
            value={callbackRate?.callbackRatePercent != null ? `${callbackRate.callbackRatePercent}%` : '—'}
            current={callbackRate?.callbackRatePercent ?? null}
            previous={prevCallbackRate?.callbackRatePercent ?? null}
            isPercent
            invertTrend
            subtitle={callbackRate ? `${callbackRate.callbackJobs} of ${callbackRate.completedJobs} completed jobs` : undefined}
          />
          <ScorecardKpi
            label="AR Outstanding"
            value={money(arOutstanding)}
            subtitle={arOverdue != null && arOverdue > 0 ? `${money(arOverdue)} overdue` : arOverdue === 0 ? 'None overdue' : undefined}
            tone={arOverdue != null && arOverdue > 0 ? 'warning' : undefined}
            onClick={() => goToDetail('/reports/all')}
          />
        </div>

        {satisfaction && satisfaction.ratedReviewCount > 0 && (
          <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Customer Rating</span>
                <p className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">{satisfaction.averageRating?.toFixed(1)} / 5</p>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {satisfaction.ratedReviewCount} review{satisfaction.ratedReviewCount === 1 ? '' : 's'} this period
                {satisfaction.fiveStarPercent != null && <> · {satisfaction.fiveStarPercent}% five-star</>}
              </div>
            </div>
          </div>
        )}
        {satisfaction && satisfaction.ratedReviewCount === 0 && (
          <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-sm text-slate-400 dark:text-slate-500">
            No customer feedback has been recorded for this period yet.
          </div>
        )}

        <div className="mt-6">
          <button onClick={() => goToDetail('/reports/all')} className="text-sm font-medium text-[var(--color-brand)] hover:underline">
            View full reports & breakdowns →
          </button>
        </div>
      </main>
    </AppShell>
  );
}

function ScorecardKpi({
  label,
  value,
  subtitle,
  current,
  previous,
  isPercent,
  invertTrend,
  tone,
  muted,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  subtitle?: string;
  current?: number | null;
  previous?: number | null;
  isPercent?: boolean;
  invertTrend?: boolean;
  tone?: 'warning' | 'danger';
  muted?: boolean;
  onClick?: () => void;
}) {
  const change = current != null && previous != null ? percentChange(current, previous) : null;
  const pointDelta = isPercent && current != null && previous != null ? Math.round((current - previous) * 10) / 10 : null;
  const goodDirection = invertTrend ? (pointDelta ?? change ?? 0) < 0 : (pointDelta ?? change ?? 0) > 0;
  const hasTrend = (pointDelta !== null || change !== null) && previous !== 0;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-left transition-colors',
        onClick && 'hover:border-[var(--color-brand)] cursor-pointer',
        !onClick && 'cursor-default',
      )}
    >
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold', muted ? 'text-slate-400 dark:text-slate-500 text-sm' : tone === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100')}>
        {value}
      </p>
      {hasTrend && (
        <p className={cn('mt-0.5 flex items-center gap-0.5 text-xs font-medium', goodDirection ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
          {goodDirection ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {pointDelta !== null ? `${pointDelta > 0 ? '+' : ''}${pointDelta}pts` : `${(change ?? 0) > 0 ? '+' : ''}${change}%`} vs previous period
        </p>
      )}
      {!hasTrend && subtitle && <p className="mt-0.5 flex items-center gap-0.5 text-xs text-slate-400 dark:text-slate-500"><Minus className="h-3 w-3" />{subtitle}</p>}
      {hasTrend && subtitle && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>}
    </button>
  );
}
