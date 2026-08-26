'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { DashboardSummary } from '../../lib/api/dashboard';

const currency = (v: string | number) => `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export function MoneyCenter({ summary }: { summary: DashboardSummary }) {
  const k = summary.snapshotKpis;
  if (!k) return null;
  const overdueCount = Number(k.overdueInvoiceCount);

  return (
    <Card title="Money Center" action={<Link href="/invoices" className="flex items-center gap-1 text-xs font-medium text-[var(--color-brand)] hover:underline">View Invoices <ArrowRight className="h-3 w-3" /></Link>}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Revenue This Month" value={currency(k.revenueThisMonth)} />
        <Metric label="Outstanding" value={currency(k.outstandingInvoices)} />
        <Metric label="Overdue" value={currency(k.overdueInvoices)} tone={overdueCount > 0 ? 'warning' : undefined} />
        <Metric label="Payments This Month" value={currency(k.paymentsReceivedThisMonth)} />
      </div>

      {summary.topOverdueInvoices && summary.topOverdueInvoices.length > 0 && (
        <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Overdue</p>
          <div className="space-y-1.5">
            {summary.topOverdueInvoices.map((inv) => (
              <Link key={inv.id} href={`/invoices/${inv.id}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800 dark:text-slate-100">{inv.customerName}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{inv.invoiceNumber} • {inv.daysOverdue} day{inv.daysOverdue === 1 ? '' : 's'} overdue</p>
                </div>
                <span className="shrink-0 font-semibold text-red-600 dark:text-red-400">{currency(inv.balanceDue)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      {summary.topOverdueInvoices && summary.topOverdueInvoices.length === 0 && (
        <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">You&apos;re up to date — no overdue invoices.</p>
      )}
    </Card>
  );
}

export function QuotePipeline({ summary }: { summary: DashboardSummary }) {
  if (!summary.estimatePipeline) return null;
  const byStatus = Object.fromEntries(summary.estimatePipeline.map((r) => [r.status, r]));
  const statuses = ['draft', 'sent', 'viewed', 'accepted', 'declined'] as const;

  return (
    <Card title="Quote Pipeline" action={<Link href="/estimates" className="flex items-center gap-1 text-xs font-medium text-[var(--color-brand)] hover:underline">View Estimates <ArrowRight className="h-3 w-3" /></Link>}>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {statuses.map((s) => (
          <Metric key={s} label={s[0].toUpperCase() + s.slice(1)} value={String(byStatus[s]?.count ?? 0)} sub={byStatus[s] ? currency(byStatus[s].totalValue) : undefined} />
        ))}
      </div>
      {summary.conversion?.conversionRatePercent != null && (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-300">{summary.conversion.conversionRatePercent}%</span> conversion rate over the last 90 days
        </p>
      )}
    </Card>
  );
}

export function CustomerFollowUp({ summary }: { summary: DashboardSummary }) {
  const hasFollowUps = summary.followUpCandidates && summary.followUpCandidates.length > 0;
  const hasRecurring = summary.recurringOverdueCandidates && summary.recurringOverdueCandidates.length > 0;
  if (!summary.followUpCandidates && !summary.recurringOverdueCandidates) return null;

  return (
    <Card title="Customer Follow-Up" action={<Link href="/customers" className="flex items-center gap-1 text-xs font-medium text-[var(--color-brand)] hover:underline">View Customers <ArrowRight className="h-3 w-3" /></Link>}>
      {!hasFollowUps && !hasRecurring && <p className="text-sm text-slate-400 dark:text-slate-500">Nothing needs your attention right now.</p>}

      {hasFollowUps && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Estimates Needing Follow-Up</p>
          {summary.followUpCandidates!.map((e) => (
            <Link key={e.id} href={`/estimates/${e.id}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800 dark:text-slate-100">{e.customerName}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{e.estimateNumber} • Sent {e.daysSinceSent} day{e.daysSinceSent === 1 ? '' : 's'} ago</p>
              </div>
              <span className="shrink-0 font-semibold text-slate-700 dark:text-slate-300">{currency(e.totalAmount)}</span>
            </Link>
          ))}
        </div>
      )}

      {hasRecurring && (
        <div className={hasFollowUps ? 'mt-4 border-t border-slate-100 dark:border-slate-800 pt-3 space-y-1.5' : 'space-y-1.5'}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Recurring Service Due</p>
          {summary.recurringOverdueCandidates!.map((p) => (
            <Link key={p.propertyId} href={`/customers/${p.customerId}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800 dark:text-slate-100">{p.customerName}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{p.addressLine1}</p>
              </div>
              <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">{p.daysOverdue}d overdue</span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

export function NeedsAttention({ summary }: { summary: DashboardSummary }) {
  const overdueCount = summary.topOverdueInvoices?.length ?? 0;
  const overdueAmount = summary.snapshotKpis ? Number(summary.snapshotKpis.overdueInvoices) : 0;
  const followUpCount = summary.followUpCandidates?.length ?? 0;
  const followUpValue = (summary.followUpCandidates ?? []).reduce((sum, e) => sum + Number(e.totalAmount), 0);
  const recurringCount = summary.recurringOverdueCandidates?.length ?? 0;

  const items = [
    overdueCount > 0 && { icon: '🔴', text: `${overdueCount} overdue invoice${overdueCount === 1 ? '' : 's'}`, sub: currency(overdueAmount), href: '/invoices' },
    followUpCount > 0 && { icon: '🟡', text: `${followUpCount} estimate${followUpCount === 1 ? '' : 's'} need${followUpCount === 1 ? 's' : ''} follow-up`, sub: `${currency(followUpValue)} potential revenue`, href: '/estimates' },
    recurringCount > 0 && { icon: '🔵', text: `${recurringCount} recurring service${recurringCount === 1 ? '' : 's'} overdue`, href: '/customers' },
  ].filter(Boolean) as { icon: string; text: string; sub?: string; href: string }[];

  return (
    <Card title="Needs Your Attention">
      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <AlertTriangle className="h-4 w-4 text-slate-300 dark:text-slate-600" /> Nothing needs your attention — everything looks good.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link key={item.text} href={item.href} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
              <span className="flex items-center gap-2">
                <span>{item.icon}</span>
                <span className="text-slate-700 dark:text-slate-300">{item.text}</span>
              </span>
              {item.sub && <span className="text-xs text-slate-400 dark:text-slate-500">{item.sub}</span>}
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warning' }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${tone === 'warning' ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}
