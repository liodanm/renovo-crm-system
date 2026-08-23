'use client';

import { Suspense, useState } from 'react';
import useSWR from 'swr';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { reportsApi, resolvePreset, DATE_PRESETS, type DatePreset } from '../../../lib/api/reports';
import { cn } from '../../../lib/utils';

function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined || Number(value) === 0) return '—';
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function SatisfactionInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStart = searchParams.get('start');
  const [preset, setPreset] = useState<DatePreset>(urlStart ? 'Custom' : 'This Month');
  const resolved = resolvePreset(preset);
  const startIso = resolved.start.toISOString();
  const endIso = resolved.end.toISOString();
  const [tab, setTab] = useState<'reviews' | 'callbacks'>('reviews');

  const { data: satisfaction } = useSWR(['satisfaction-summary', startIso, endIso], () => reportsApi.getCustomerSatisfaction(startIso, endIso));
  const { data: callbackRate } = useSWR(['callback-rate', startIso, endIso], () => reportsApi.getCallbackRate(startIso, endIso));
  const { data: reviews, isLoading: reviewsLoading } = useSWR(tab === 'reviews' ? ['reviews', startIso, endIso] : null, () => reportsApi.getReviewList(startIso, endIso));
  const { data: callbacks, isLoading: callbacksLoading } = useSWR(tab === 'callbacks' ? ['callbacks', startIso, endIso] : null, () => reportsApi.getCallbackList(startIso, endIso));

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/reports" className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">← Owner Scorecard</Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Satisfaction & Callbacks</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Are customers happy, and how often does completed work need a return visit?</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
          {DATE_PRESETS.filter((p) => p !== 'Custom').map((p) => (
            <button key={p} onClick={() => { setPreset(p); router.replace('/reports/satisfaction'); }}
              className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium', preset === p ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400')}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Average Rating" value={satisfaction?.averageRating != null ? `${satisfaction.averageRating} ★` : 'Not Rated'} />
        <Kpi label="Review Count" value={satisfaction?.ratedReviewCount ?? '—'} />
        <Kpi label="5-Star %" value={satisfaction?.fiveStarPercent != null ? `${satisfaction.fiveStarPercent}%` : '—'} />
        <Kpi label="Callback Count" value={callbackRate?.callbackJobs ?? '—'} />
        <Kpi label="Callback Rate" value={callbackRate?.callbackRatePercent != null ? `${callbackRate.callbackRatePercent}%` : '—'} tone={callbackRate?.callbackRatePercent != null && callbackRate.callbackRatePercent > 5 ? 'warning' : undefined} />
        <Kpi label="Eligible Completed Jobs" value={callbackRate?.completedJobs ?? '—'} />
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex gap-1 border-b border-slate-100 dark:border-slate-800">
          {(['reviews', 'callbacks'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn('border-b-2 px-3 py-2 text-xs font-medium capitalize', tab === t ? 'border-[var(--color-brand)] text-[var(--color-brand)]' : 'border-transparent text-slate-400 dark:text-slate-500')}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'reviews' && (
          <div className="mt-3 overflow-x-auto">
            {reviewsLoading && <div className="h-32 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />}
            {!reviewsLoading && reviews?.length === 0 && <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No customer satisfaction data is available for this period.</p>}
            {!reviewsLoading && reviews && reviews.length > 0 && (
              <table className="w-full text-xs">
                <thead className="text-slate-400 dark:text-slate-500">
                  <tr>
                    <th className="pb-1.5 text-left font-medium">Customer</th>
                    <th className="pb-1.5 text-left font-medium">Job</th>
                    <th className="pb-1.5 text-left font-medium">Service</th>
                    <th className="pb-1.5 text-left font-medium">Date</th>
                    <th className="pb-1.5 text-right font-medium">Rating</th>
                    <th className="pb-1.5 text-left font-medium">Callback</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {reviews.map((r) => (
                    <tr key={r.reviewId}>
                      <td className="py-1.5 text-slate-700 dark:text-slate-300">{r.customerName ?? '—'}</td>
                      <td className="py-1.5 text-slate-700 dark:text-slate-300">{r.jobNumber ?? '—'}</td>
                      <td className="py-1.5 text-slate-700 dark:text-slate-300">{r.serviceName ?? '—'}</td>
                      <td className="py-1.5 text-slate-500 dark:text-slate-400">{fmtDate(r.reviewDate)}</td>
                      <td className="py-1.5 text-right">
                        {r.rating != null ? (
                          <span className="inline-flex items-center gap-0.5 font-medium text-slate-900 dark:text-slate-100">{r.rating} <Star className="h-3 w-3 fill-amber-400 text-amber-400" /></span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">Not Rated</span>
                        )}
                      </td>
                      <td className="py-1.5 text-slate-500 dark:text-slate-400">{r.hadCallback ? 'Yes' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'callbacks' && (
          <div className="mt-3 overflow-x-auto">
            {callbacksLoading && <div className="h-32 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />}
            {!callbacksLoading && callbacks?.length === 0 && <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No callbacks were recorded during this period.</p>}
            {!callbacksLoading && callbacks && callbacks.length > 0 && (
              <table className="w-full text-xs">
                <thead className="text-slate-400 dark:text-slate-500">
                  <tr>
                    <th className="pb-1.5 text-left font-medium">Job</th>
                    <th className="pb-1.5 text-left font-medium">Customer</th>
                    <th className="pb-1.5 text-left font-medium">Service</th>
                    <th className="pb-1.5 text-left font-medium">Date</th>
                    <th className="pb-1.5 text-left font-medium">Reason</th>
                    <th className="pb-1.5 text-left font-medium">Status</th>
                    <th className="pb-1.5 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {callbacks.map((c) => (
                    <tr key={c.callbackId}>
                      <td className="py-1.5"><Link href={`/jobs/${c.jobId}`} className="text-[var(--color-brand)] hover:underline">{c.jobNumber}</Link></td>
                      <td className="py-1.5 text-slate-700 dark:text-slate-300">{c.customerName}</td>
                      <td className="py-1.5 text-slate-700 dark:text-slate-300">{c.serviceName}</td>
                      <td className="py-1.5 text-slate-500 dark:text-slate-400">{fmtDate(c.originalJobDate)}</td>
                      <td className="py-1.5 text-slate-700 dark:text-slate-300">{c.reason.replace(/_/g, ' ')}</td>
                      <td className="py-1.5">
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', c.status === 'resolved' ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : c.status === 'cancelled' ? 'bg-slate-100 dark:bg-slate-800 text-slate-500' : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300')}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{money(c.callbackCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
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

export default function SatisfactionPage() {
  return (
    <Suspense fallback={null}>
      <SatisfactionInner />
    </Suspense>
  );
}
