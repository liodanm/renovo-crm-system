'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Search } from 'lucide-react';
import { estimatesApi, type Estimate } from '../../lib/api/estimates';
import { AppShell } from '../../components/layout/AppShell';
import { MobileListCard } from '../../components/ui/mobile-list-card';
import { ESTIMATE_STATUS_COLORS } from '../../components/action-center/StatusBadge';

type StatusFilter = 'needsResponse' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'all';
const NEEDS_RESPONSE_STATUSES = new Set(['draft', 'sent', 'viewed']);
// Pipeline = money still in play — excludes declined/expired, matches
// the same intent as ReportsService.getEstimatePipeline without a
// second network call, since the full list is already fetched here.
const PIPELINE_STATUSES = new Set(['draft', 'sent', 'viewed', 'accepted']);

// Explicit hex values, applied via inline style rather than a Tailwind
// border-color utility class — the rail is assembled from a
// runtime-interpolated template string, and relying on Tailwind's
// build-time class scanner to reliably pick up every dynamically-
// composed class name is exactly the kind of thing that silently drops
// classes in production. Inline color guarantees the rail always
// renders, regardless of any purge/JIT scanning edge case.
const STATUS_RAIL_HEX: Record<string, string> = {
  draft: '#94a3b8',
  sent: '#3b82f6',
  viewed: '#a855f7',
  accepted: '#10b981',
  declined: '#ef4444',
  expired: '#f97316',
};

function customerName(customer: { firstName: string | null; lastName: string | null; businessName: string | null }): string {
  return customer.businessName ?? (`${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || 'Unknown');
}

function formatMoney(value: string): string {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function relativeDays(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function statusTiming(estimate: Estimate): string | null {
  if (estimate.status === 'viewed') return relativeDays(estimate.viewedAt);
  if (estimate.status === 'sent') return relativeDays(estimate.sentAt);
  if (estimate.status === 'accepted') return relativeDays(estimate.acceptedAt);
  if (estimate.status === 'declined') return relativeDays(estimate.declinedAt);
  return null;
}

function applyStatusFilter(estimates: Estimate[], filter: StatusFilter): Estimate[] {
  if (filter === 'all') return estimates;
  if (filter === 'needsResponse') return estimates.filter((e) => NEEDS_RESPONSE_STATUSES.has(e.status));
  return estimates.filter((e) => e.status === filter);
}

function matchesSearch(e: Estimate, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    e.estimateNumber.toLowerCase().includes(needle) ||
    customerName(e.customer).toLowerCase().includes(needle) ||
    e.property.addressLine1.toLowerCase().includes(needle) ||
    e.property.city.toLowerCase().includes(needle)
  );
}

function EstimatesPageInner() {
  const { data: allEstimates, error, isLoading } = useSWR('estimates', () => estimatesApi.list());
  // Reads ?status=accepted from a drill-down link (e.g. the Estimate
  // Conversion report) as the initial filter — the existing toggle
  // below still works exactly as before for anyone navigating here
  // directly; this only changes what filter is pre-selected on load.
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status');
  const [filter, setFilter] = useState<StatusFilter>(
    initialStatus === 'accepted' || initialStatus === 'declined' || initialStatus === 'sent' || initialStatus === 'viewed' ? initialStatus : 'all',
  );
  const [search, setSearch] = useState('');

  const counts = useMemo(() => {
    if (!allEstimates) return null;
    const c: Record<StatusFilter, number> = { needsResponse: 0, sent: 0, viewed: 0, accepted: 0, declined: 0, all: allEstimates.length };
    for (const e of allEstimates) {
      if (NEEDS_RESPONSE_STATUSES.has(e.status)) c.needsResponse++;
      if (e.status === 'sent') c.sent++;
      if (e.status === 'viewed') c.viewed++;
      if (e.status === 'accepted') c.accepted++;
      if (e.status === 'declined') c.declined++;
    }
    return c;
  }, [allEstimates]);

  const pipelineValue = useMemo(() => {
    if (!allEstimates) return null;
    return allEstimates.filter((e) => PIPELINE_STATUSES.has(e.status)).reduce((sum, e) => sum + Number(e.totalAmount), 0);
  }, [allEstimates]);

  const estimates = useMemo(() => {
    if (!allEstimates) return undefined;
    return applyStatusFilter(allEstimates, filter).filter((e) => matchesSearch(e, search));
  }, [allEstimates, filter, search]);

  const FILTER_TABS: { key: StatusFilter; label: string }[] = [
    { key: 'needsResponse', label: 'Needs Response' },
    { key: 'sent', label: 'Sent' },
    { key: 'viewed', label: 'Viewed' },
    { key: 'accepted', label: 'Accepted' },
    { key: 'declined', label: 'Declined' },
    { key: 'all', label: 'All' },
  ];

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Estimates</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {counts ? `${counts.all} estimates · ${formatMoney(String(pipelineValue))} pipeline` : 'Loading…'}
            </p>
          </div>
          <Link href="/estimates/new" className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            + New Estimate
          </Link>
        </div>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {FILTER_TABS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === opt.key ? 'bg-[var(--color-brand)] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              {opt.label} {counts ? counts[opt.key] : ''}
            </button>
          ))}
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search estimates, customers, addresses…"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-2 pl-9 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
          />
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          {isLoading && <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>}
          {error && <div className="p-8 text-center text-sm text-red-600 dark:text-red-400">Couldn't load estimates. Try refreshing.</div>}
          {estimates && estimates.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {search ? (
                'No estimates match your search.'
              ) : filter === 'needsResponse' ? (
                <>✓ You're all caught up — nothing waiting on a response.</>
              ) : filter === 'all' ? (
                <>
                  No estimates yet. <Link href="/estimates/new" className="text-[var(--color-brand)]">Create your first one</Link>.
                </>
              ) : (
                'No estimates here.'
              )}
            </div>
          )}
          {estimates && estimates.length > 0 && (
            <>
              <table className="hidden w-full text-sm lg:table">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Estimate #</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Property</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {estimates.map((estimate) => {
                    const timing = statusTiming(estimate);
                    const muted = estimate.status === 'declined' || estimate.status === 'expired';
                    return (
                      <tr
                        key={estimate.id}
                        style={{ borderLeftWidth: '4px', borderLeftStyle: 'solid', borderLeftColor: STATUS_RAIL_HEX[estimate.status] ?? '#94a3b8' }}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800 ${muted ? 'opacity-60' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <Link href={`/estimates/${estimate.id}`} className="block text-base font-bold text-[var(--color-brand)] dark:text-blue-300">
                            {estimate.estimateNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/estimates/${estimate.id}`} className="block text-slate-700 dark:text-slate-300">{customerName(estimate.customer)}</Link>
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                          <Link href={`/estimates/${estimate.id}`} className="block">{estimate.property.addressLine1}, {estimate.property.city}</Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/estimates/${estimate.id}`} className="block">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTIMATE_STATUS_COLORS[estimate.status]?.className ?? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                              {ESTIMATE_STATUS_COLORS[estimate.status]?.label ?? estimate.status}
                            </span>
                            {timing && <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">{timing}</span>}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                          <Link href={`/estimates/${estimate.id}`} className="block">{formatMoney(estimate.totalAmount)}</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="space-y-3 p-3 lg:hidden">
                {estimates.map((estimate) => (
                  <MobileListCard
                    key={estimate.id}
                    href={`/estimates/${estimate.id}`}
                    title={estimate.estimateNumber}
                    subtitle={`${customerName(estimate.customer)} · ${estimate.property.addressLine1}, ${estimate.property.city}`}
                    statusLabel={`${ESTIMATE_STATUS_COLORS[estimate.status]?.label ?? estimate.status}${statusTiming(estimate) ? ' · ' + statusTiming(estimate) : ''}`}
                    statusClassName={ESTIMATE_STATUS_COLORS[estimate.status]?.className}
                    railColorHex={STATUS_RAIL_HEX[estimate.status] ?? '#94a3b8'}
                    amount={formatMoney(estimate.totalAmount)}
                    amountLabel="Total"
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

export default function EstimatesPage() {
  return (
    <Suspense fallback={null}>
      <EstimatesPageInner />
    </Suspense>
  );
}

