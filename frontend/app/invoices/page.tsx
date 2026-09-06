'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Search } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { MobileListCard } from '../../components/ui/mobile-list-card';
import { invoicesApi, invoiceCustomerName, INVOICE_STATUS_LABELS, INVOICE_STATUS_STYLES } from '../../lib/api/invoices';

function formatMoney(value: string | number): string {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Real statuses only — matches INVOICE_STATUS_STYLES exactly, not a
// hypothetical status list. "All" plus the 6 that actually exist.
const STATUS_FILTER_OPTIONS = ['all', 'draft', 'sent', 'partial', 'paid', 'overdue', 'void'] as const;

export default function InvoicesPage() {
  const { data: invoices, error, isLoading } = useSWR('invoices', () => invoicesApi.list());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTER_OPTIONS)[number]>('all');

  // Every metric here is derived from data already fetched above — no
  // new API calls, no new reporting subsystem, just arithmetic over
  // the same array the table already renders.
  const summary = useMemo(() => {
    if (!invoices) return null;
    const nonVoid = invoices.filter((inv) => inv.status !== 'void');
    return {
      totalCount: invoices.length,
      totalInvoiced: nonVoid.reduce((sum, inv) => sum + Number(inv.totalAmount), 0),
      outstanding: nonVoid.reduce((sum, inv) => sum + Number(inv.balanceDue), 0),
      overdueCount: invoices.filter((inv) => inv.status === 'overdue').length,
      overdueAmount: invoices.filter((inv) => inv.status === 'overdue').reduce((sum, inv) => sum + Number(inv.balanceDue), 0),
      paidCount: invoices.filter((inv) => inv.status === 'paid').length,
    };
  }, [invoices]);

  const filtered = useMemo(() => {
    if (!invoices) return [];
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (!q) return true;
      return inv.invoiceNumber.toLowerCase().includes(q) || invoiceCustomerName(inv).toLowerCase().includes(q);
    });
  }, [invoices, search, statusFilter]);

  return (
    <AppShell>
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Invoices</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Track what's been billed and what's still outstanding.</p>
          </div>
        </div>

        {summary && summary.totalCount > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryCard label="Total Invoices" value={String(summary.totalCount)} />
            <SummaryCard label="Total Invoiced" value={formatMoney(summary.totalInvoiced)} />
            <SummaryCard label="Outstanding" value={formatMoney(summary.outstanding)} />
            <SummaryCard label="Overdue" value={formatMoney(summary.overdueAmount)} sublabel={summary.overdueCount > 0 ? `${summary.overdueCount} invoice${summary.overdueCount === 1 ? '' : 's'}` : undefined} emphasis="red" />
            <SummaryCard label="Paid" value={String(summary.paidCount)} emphasis="green" />
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice or customer"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-slate-300"
          >
            {STATUS_FILTER_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === 'all' ? 'All statuses' : INVOICE_STATUS_LABELS[s] ?? s}</option>
            ))}
          </select>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          {isLoading && <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>}
          {error && <div className="p-8 text-center text-sm text-red-600 dark:text-red-400">Couldn't load invoices.</div>}
          {invoices && invoices.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No invoices yet. Generate one from a completed job on the{' '}
              <Link href="/jobs" className="text-[var(--color-brand)] dark:text-blue-400">Jobs</Link> page.
            </div>
          )}
          {invoices && invoices.length > 0 && filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">No invoices match your search.</div>
          )}
          {filtered.length > 0 && (
            <>
              <table className="hidden w-full text-sm lg:table">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Invoice #</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Balance Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((inv) => (
                    <tr key={inv.id} className="group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${inv.id}`} className="font-semibold text-[var(--color-brand)] dark:text-blue-400 group-hover:underline">
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{invoiceCustomerName(inv)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${INVOICE_STATUS_STYLES[inv.status] ?? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                          {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{formatMoney(inv.totalAmount)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">{formatMoney(inv.balanceDue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="space-y-3 p-3 lg:hidden">
                {filtered.map((inv) => (
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

function SummaryCard({ label, value, sublabel, emphasis }: { label: string; value: string; sublabel?: string; emphasis?: 'red' | 'green' }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${emphasis === 'red' ? 'text-red-600 dark:text-red-400' : emphasis === 'green' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
        {value}
      </p>
      {sublabel && <p className="text-[11px] text-slate-400 dark:text-slate-500">{sublabel}</p>}
    </div>
  );
}
