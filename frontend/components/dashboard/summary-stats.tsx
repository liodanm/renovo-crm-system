'use client';

import { useDashboardSummary } from '../../lib/hooks/use-dashboard';
import { StatCard, StatCardSkeleton } from './stat-card';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function SummaryStats() {
  const { data, error, isLoading } = useDashboardSummary();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
        Couldn&apos;t load your dashboard stats. Refreshing shortly…
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {data.todaysJobs && (
        <StatCard
          label="Today's Jobs"
          value={String(data.todaysJobs.count)}
          subtext={`${data.todaysJobs.completedCount} completed`}
        />
      )}

      {data.todaysRevenue && (
        <StatCard
          label="Today's Revenue"
          value={currency.format(data.todaysRevenue.total)}
          subtext={`${data.todaysRevenue.paymentCount} payment${data.todaysRevenue.paymentCount === 1 ? '' : 's'}`}
          accent="success"
        />
      )}

      {data.pendingEstimates && (
        <StatCard
          label="Pending Estimates"
          value={String(data.pendingEstimates.count)}
          subtext={
            data.pendingEstimates.olderThan3Days > 0
              ? `${data.pendingEstimates.olderThan3Days} need follow-up`
              : `${currency.format(data.pendingEstimates.totalValue)} in flight`
          }
          accent={data.pendingEstimates.olderThan3Days > 0 ? 'warning' : 'default'}
        />
      )}

      {data.openLeads && (
        <StatCard
          label="Open Leads"
          value={String(data.openLeads.count)}
          subtext={data.openLeads.staleCount > 0 ? `${data.openLeads.staleCount} going cold` : 'All active'}
          accent={data.openLeads.staleCount > 0 ? 'warning' : 'default'}
        />
      )}
    </div>
  );
}
