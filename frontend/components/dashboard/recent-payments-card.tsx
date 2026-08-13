'use client';

import { useDashboardSummary } from '../../lib/hooks/use-dashboard';
import { DashboardCard, CardSkeleton, CardError, CardEmpty, CardLocked } from './dashboard-card';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const METHOD_LABELS: Record<string, string> = {
  card: 'Card',
  ach: 'ACH',
  cash: 'Cash',
  check: 'Check',
  other: 'Other',
};

function formatRelative(iso: string) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.round(diffMs / 3_600_000);
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export function RecentPaymentsCard() {
  const { data, error, isLoading } = useDashboardSummary();

  return (
    <DashboardCard title="Recent Payments" icon={<CashIcon />}>
      {isLoading && <CardSkeleton lines={4} />}
      {error && <CardError />}
      {!isLoading && !error && data && !data.recentPayments && <CardLocked />}
      {!isLoading && !error && data?.recentPayments && data.recentPayments.length === 0 && (
        <CardEmpty message="No payments recorded yet." />
      )}
      {!isLoading && !error && data?.recentPayments && data.recentPayments.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {data.recentPayments.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{p.customerName}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {METHOD_LABELS[p.method] ?? p.method} · {formatRelative(p.processedAt)}
                </div>
              </div>
              <div className="shrink-0 text-sm font-semibold text-emerald-600 dark:text-emerald-400">{currency.format(p.amount)}</div>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

function CashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}
