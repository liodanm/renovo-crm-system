'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { reportsApi } from '../../../lib/api/reports';
import { cn } from '../../../lib/utils';

function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

type SortKey = 'completedJobs' | 'lifetimeRevenue' | 'lastJob' | 'firstJob';

export default function RepeatCustomersPage() {
  const { data: summary } = useSWR('repeat-customers-summary', () => reportsApi.getRepeatCustomersSummary());
  const { data: rows, error, isLoading } = useSWR('repeat-customers-table', () => reportsApi.getRepeatCustomersTable());
  const [sortKey, setSortKey] = useState<SortKey>('completedJobs');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const sorted = rows
    ? [...rows].sort((a, b) => {
        if (sortKey === 'lastJob' || sortKey === 'firstJob') return new Date(b[sortKey] ?? 0).getTime() - new Date(a[sortKey] ?? 0).getTime();
        return Number(b[sortKey]) - Number(a[sortKey]);
      })
    : undefined;
  const paged = sorted?.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = sorted ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
      <Link href="/reports" className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">← Owner Scorecard</Link>
      <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Repeat & Recurring Customers</h1>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Are customers coming back — lifetime figures, not filtered by date range.</p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Total Customers" value={summary?.totalCustomers ?? '—'} />
        <Kpi label="Repeat Customers" value={summary?.repeatCustomers ?? '—'} highlight />
        <Kpi label="Repeat Rate" value={summary?.repeatCustomerRatePercent != null ? `${summary.repeatCustomerRatePercent}%` : '—'} />
        <Kpi label="Avg Jobs / Customer" value={summary?.averageJobsPerCustomer ?? '—'} />
        <Kpi label="Customers with 2+ Jobs" value={summary?.customersWithTwoPlusJobs ?? '—'} />
      </div>

      {/* Recurring Revenue — deliberately "Not yet available," same
          principle the Owner Scorecard already established. Renovo has
          no per-customer recurring schedule/billing data model today
          (service_requests.is_recurring only records that a customer
          once indicated interest, not an enforced ongoing schedule),
          so a dollar figure here would be fabricated, not measured. */}
      <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
        <strong className="text-slate-700 dark:text-slate-300">Recurring Revenue:</strong> Not yet available. Renovo doesn't currently store an enforced per-customer recurring schedule, so this can't be calculated reliably. The &quot;Interested in Recurring&quot; column below reflects only whether a customer has ever submitted a recurring service request — not a next-due date or ongoing schedule, which would require data Renovo doesn't have.
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">By Customer</h2>
          <select value={sortKey} onChange={(e) => { setSortKey(e.target.value as SortKey); setPage(1); }} className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs dark:bg-slate-900 dark:text-slate-100">
            <option value="completedJobs">Sort: Jobs</option>
            <option value="lifetimeRevenue">Sort: Lifetime Revenue</option>
            <option value="lastJob">Sort: Most Recent Service</option>
            <option value="firstJob">Sort: First Service</option>
          </select>
        </div>

        <div className="mt-3 overflow-x-auto">
          {isLoading && <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />}
          {error && !isLoading && <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">We couldn't load this report right now. Please try refreshing.</p>}
          {!isLoading && !error && sorted?.length === 0 && <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No completed customer activity found.</p>}

          {!isLoading && !error && paged && paged.length > 0 && (
            <>
              <table className="w-full min-w-[720px] text-xs">
                <thead className="text-slate-400 dark:text-slate-500">
                  <tr>
                    <th className="pb-1.5 text-left font-medium">Customer</th>
                    <th className="pb-1.5 text-right font-medium">Jobs</th>
                    <th className="pb-1.5 text-right font-medium">Lifetime Revenue</th>
                    <th className="pb-1.5 text-left font-medium">First Service</th>
                    <th className="pb-1.5 text-left font-medium">Last Service</th>
                    <th className="pb-1.5 text-left font-medium">Status</th>
                    <th className="pb-1.5 text-left font-medium">Interested in Recurring</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paged.map((row) => (
                    <tr key={row.customerId}>
                      <td className="py-1.5"><Link href={`/customers/${row.customerId}`} className="font-medium text-[var(--color-brand)] hover:underline">{row.customerName}</Link></td>
                      <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{row.completedJobs}</td>
                      <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{money(row.lifetimeRevenue)}</td>
                      <td className="py-1.5 text-slate-500 dark:text-slate-400">{fmtDate(row.firstJob)}</td>
                      <td className="py-1.5 text-slate-500 dark:text-slate-400">{fmtDate(row.lastJob)}</td>
                      <td className="py-1.5">
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', row.isRepeat ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400')}>
                          {row.isRepeat ? 'Repeat' : 'New'}
                        </span>
                      </td>
                      <td className="py-1.5 text-slate-500 dark:text-slate-400">{row.hasRequestedRecurring ? 'Yes' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Page {page} of {totalPages} — {sorted!.length} customers</span>
                  <div className="flex gap-1">
                    <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-slate-200 dark:border-slate-700 px-2 py-1 disabled:opacity-40">Previous</button>
                    <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border border-slate-200 dark:border-slate-700 px-2 py-1 disabled:opacity-40">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
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
