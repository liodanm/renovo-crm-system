'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { estimatesApi } from '../../lib/api/estimates';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-700',
  viewed: 'bg-indigo-100 text-indigo-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
  expired: 'bg-amber-100 text-amber-700',
};

function customerName(customer: { firstName: string | null; lastName: string | null; businessName: string | null }): string {
  return customer.businessName ?? (`${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || 'Unknown');
}

function formatMoney(value: string): string {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function EstimatesPage() {
  const { data: estimates, error, isLoading } = useSWR('estimates', () => estimatesApi.list());

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-[var(--color-brand)]">Renovo CRM</Link>
          <nav className="hidden gap-4 text-sm font-medium text-slate-500 sm:flex">
            <Link href="/" className="hover:text-slate-800">Dashboard</Link>
            <Link href="/customers" className="hover:text-slate-800">Customers</Link>
            <Link href="/estimates" className="text-slate-900">Estimates</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Estimates</h1>
            <p className="mt-1 text-sm text-slate-500">
              {estimates ? `${estimates.length} total` : 'Loading…'}
            </p>
          </div>
          <Link
            href="/estimates/new"
            className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            New Estimate
          </Link>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {isLoading && <div className="p-8 text-center text-sm text-slate-500">Loading…</div>}
          {error && <div className="p-8 text-center text-sm text-red-600">Couldn't load estimates. Try refreshing.</div>}
          {estimates && estimates.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No estimates yet. <Link href="/estimates/new" className="text-[var(--color-brand)]">Create your first one</Link>.
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
    </div>
  );
}
