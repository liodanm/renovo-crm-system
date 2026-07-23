'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { estimatesApi, type Estimate } from '../../lib/api/estimates';
import { AppShell } from '../../components/layout/AppShell';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-700',
  viewed: 'bg-indigo-100 text-indigo-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
  expired: 'bg-amber-100 text-amber-700',
};

type StatusFilter = 'needsResponse' | 'accepted' | 'all';
const NEEDS_RESPONSE_STATUSES = new Set(['draft', 'sent', 'viewed']);

function customerName(customer: { firstName: string | null; lastName: string | null; businessName: string | null }): string {
  return customer.businessName ?? (`${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || 'Unknown');
}

function formatMoney(value: string): string {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function applyStatusFilter(estimates: Estimate[], filter: StatusFilter): Estimate[] {
  if (filter === 'all') return estimates;
  if (filter === 'accepted') return estimates.filter((e) => e.status === 'accepted');
  return estimates.filter((e) => NEEDS_RESPONSE_STATUSES.has(e.status));
}

export default function EstimatesPage() {
  const { data: allEstimates, error, isLoading } = useSWR('estimates', () => estimatesApi.list());
  const [filter, setFilter] = useState<StatusFilter>('needsResponse');

  const estimates = useMemo(() => (allEstimates ? applyStatusFilter(allEstimates, filter) : undefined), [allEstimates, filter]);

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Estimates</h1>
            <p className="mt-1 text-sm text-slate-500">
              {estimates ? `${estimates.length} ${filter === 'all' ? 'total' : 'shown'}` : 'Loading…'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {([
                { key: 'needsResponse', label: 'Needs Response' },
                { key: 'accepted', label: 'Accepted' },
                { key: 'all', label: 'All' },
              ] as { key: StatusFilter; label: string }[]).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setFilter(opt.key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${filter === opt.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Link
              href="/estimates/new"
              className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              New Estimate
            </Link>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {isLoading && <div className="p-8 text-center text-sm text-slate-500">Loading…</div>}
          {error && <div className="p-8 text-center text-sm text-red-600">Couldn't load estimates. Try refreshing.</div>}
          {estimates && estimates.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              {filter === 'needsResponse' ? (
                <>Nothing waiting on a response. <button onClick={() => setFilter('all')} className="text-[var(--color-brand)]">View all estimates</button></>
              ) : (
                <>
                  No estimates yet. <Link href="/estimates/new" className="text-[var(--color-brand)]">Create your first one</Link>.
                </>
              )}
            </div>
          )}
          {estimates && estimates.length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Estimate #</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Property</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {estimates.map((estimate) => (
                  <tr key={estimate.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/estimates/${estimate.id}`} className="font-medium text-[var(--color-brand)]">
                        {estimate.estimateNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{customerName(estimate.customer)}</td>
                    <td className="px-4 py-3 text-slate-500">{estimate.property.addressLine1}, {estimate.property.city}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[estimate.status] ?? 'bg-slate-100 text-slate-700'}`}>
                        {estimate.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(estimate.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </AppShell>
  );
}
