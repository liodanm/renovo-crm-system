'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { AppShell } from '../../components/layout/AppShell';
import { MobileListCard } from '../../components/ui/mobile-list-card';
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
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Invoices</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{invoices ? `${invoices.length} total` : 'Loading…'}</p>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          {isLoading && <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>}
          {error && <div className="p-8 text-center text-sm text-red-600 dark:text-red-400">Couldn't load invoices.</div>}
          {invoices && invoices.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No invoices yet. Generate one from a completed job on the{' '}
              <Link href="/jobs" className="text-[var(--color-brand)]">Jobs</Link> page.
            </div>
          )}
          {invoices && invoices.length > 0 && (
            <>
              <table className="hidden w-full text-sm lg:table">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
                    <tr key={inv.id} className="hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800">
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${inv.id}`} className="font-medium text-[var(--color-brand)]">{inv.invoiceNumber}</Link>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{invoiceCustomerName(inv)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${INVOICE_STATUS_STYLES[inv.status] ?? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                          {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{formatMoney(inv.totalAmount)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-slate-100">{formatMoney(inv.balanceDue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="space-y-3 p-3 lg:hidden">
                {invoices.map((inv) => (
                  <MobileListCard
                    key={inv.id}
                    href={`/invoices/${inv.id}`}
                    title={invoiceCustomerName(inv)}
                    subtitle={inv.dueDate ? `Due ${new Date(inv.dueDate).toLocaleDateString()}` : undefined}
                    statusLabel={INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                    statusClassName={INVOICE_STATUS_STYLES[inv.status]}
                    amount={formatMoney(inv.balanceDue)}
                    amountLabel="Balance Due"
                    meta={[
                      { label: 'Invoice #', value: inv.invoiceNumber },
                      { label: 'Total', value: formatMoney(inv.totalAmount) },
                    ]}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}
