'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { AppShell } from '../../components/layout/AppShell';
import { invoicesApi, invoiceCustomerName, INVOICE_STATUS_LABELS, INVOICE_STATUS_STYLES } from '../../lib/api/invoices';

function formatMoney(value: string): string {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function InvoicesPage() {
  const { data: invoices, error, isLoading } = useSWR('invoices', () => invoicesApi.list());

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Invoices</h1>
          <p className="mt-1 text-sm text-slate-500">{invoices ? `${invoices.length} total` : 'Loading…'}</p>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {isLoading && <div className="p-8 text-center text-sm text-slate-500">Loading…</div>}
          {error && <div className="p-8 text-center text-sm text-red-600">Couldn't load invoices.</div>}
          {invoices && invoices.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No invoices yet. Generate one from a completed job on the{' '}
              <Link href="/jobs" className="text-[var(--color-brand)]">Jobs</Link> page.
            </div>
          )}
          {invoices && invoices.length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Balance Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/invoices/${inv.id}`} className="font-medium text-[var(--color-brand)]">{inv.invoiceNumber}</Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{invoiceCustomerName(inv)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${INVOICE_STATUS_STYLES[inv.status] ?? 'bg-slate-100 text-slate-700'}`}>
                        {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatMoney(inv.totalAmount)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(inv.balanceDue)}</td>
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
