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

export default function CustomerLtvPage() {
  const { data: summary } = useSWR('customer-ltv-summary', () => reportsApi.getCustomerLtvSummary());
  const { data: rows, error, isLoading } = useSWR('customer-ltv-table', () => reportsApi.getCustomerLtvTable());
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const paged = rows?.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = rows ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
      <Link href="/reports" className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">← Owner Scorecard</Link>
      <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Customer Lifetime Value</h1>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Which customers have generated the most collected revenue — over their entire history, not a selected period.</p>

      {/* No date-range selector on this page, deliberately — Lifetime
          Value is exactly that: lifetime. A date filter would either do
          nothing (if it only filtered which customers show up) or
          silently turn "lifetime" into "period revenue," which is a
          different, narrower metric this page isn't showing. */}
      <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
        These are lifetime figures across each customer's entire history — not filtered by date range.
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Total Customers" value={summary?.totalCustomers ?? '—'} />
        <Kpi label="Total Lifetime Revenue" value={money(summary?.totalLifetimeRevenue)} highlight />
        <Kpi label="Average Customer LTV" value={money(summary?.averageLtv)} />
        <Kpi label="Median Customer LTV" value={money(summary?.medianLtv)} />
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">By Customer</h2>
        <div className="mt-3 overflow-x-auto">
          {isLoading && <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />}
          {error && !isLoading && <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">We couldn't load customer LTV right now. Please try refreshing.</p>}
          {!isLoading && !error && rows?.length === 0 && <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No customers found.</p>}

          {!isLoading && !error && paged && paged.length > 0 && (
            <>
              <table className="w-full min-w-[640px] text-xs">
                <thead className="text-slate-400 dark:text-slate-500">
                  <tr>
                    <th className="pb-1.5 text-left font-medium">Customer</th>
                    <th className="pb-1.5 text-right font-medium">Lifetime Revenue</th>
                    <th className="pb-1.5 text-right font-medium">Jobs</th>
                    <th className="pb-1.5 text-right font-medium">Avg Ticket</th>
                    <th className="pb-1.5 text-left font-medium">First Job</th>
                    <th className="pb-1.5 text-left font-medium">Last Job</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paged.map((row) => (
                    <tr key={row.customerId}>
                      <td className="py-1.5"><Link href={`/customers/${row.customerId}`} className="font-medium text-[var(--color-brand)] hover:underline">{row.customerName}</Link></td>
                      <td className="py-1.5 text-right font-medium text-slate-900 dark:text-slate-100">{money(row.lifetimeRevenue)}</td>
                      <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{row.completedJobs}</td>
                      <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">{money(row.averageTicket)}</td>
                      <td className="py-1.5 text-slate-500 dark:text-slate-400">{fmtDate(row.firstJob)}</td>
                      <td className="py-1.5 text-slate-500 dark:text-slate-400">{fmtDate(row.lastJob)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Page {page} of {totalPages} — {rows!.length} customers</span>
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
