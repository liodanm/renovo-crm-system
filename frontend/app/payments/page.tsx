'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { AppShell } from '../../components/layout/AppShell';
import { paymentsApi, invoiceCustomerNameFromReceipt, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES } from '../../lib/api/payments';
import { cn } from '../../lib/utils';

function formatMoney(value: string): string {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PaymentsPage() {
  const { data: payments, error, isLoading } = useSWR('payments', () => paymentsApi.list());

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Payments</h1>
          <p className="mt-1 text-sm text-slate-500">{payments ? `${payments.length} total` : 'Loading…'}</p>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {isLoading && <div className="p-8 text-center text-sm text-slate-500">Loading…</div>}
          {error && <div className="p-8 text-center text-sm text-red-600">Couldn't load payments.</div>}
          {payments && payments.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No payments recorded yet. Record one from an{' '}
              <Link href="/invoices" className="text-[var(--color-brand)]">invoice</Link>.
            </div>
          )}
          {payments && payments.length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/invoices/${p.invoiceId}`} className="font-medium text-[var(--color-brand)]">{p.invoiceNumber}</Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{invoiceCustomerNameFromReceipt(p)}</td>
                    <td className="px-4 py-3 text-slate-500">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</td>
                    <td className="px-4 py-3 text-slate-500">{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', PAYMENT_STATUS_STYLES[p.status] ?? 'bg-slate-100 text-slate-700')}>
                        {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(p.amount)}</td>
                    <td className="px-4 py-3 text-right">
                      {p.status === 'succeeded' && <Link href={`/payments/receipt/${p.id}`} className="text-xs text-[var(--color-brand)]">Receipt</Link>}
                    </td>
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
