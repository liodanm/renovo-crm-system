/**
 * NOT a production code path — the real calculation runs as raw SQL in
 * ReportsService.getServiceProfitability (see that method's own
 * extensive comment on grain/revenue-basis decisions). This is a
 * deliberate, test-only mirror of that exact arithmetic, written solely
 * so the weighted-margin formula and the worked example from the Group
 * 2 spec have a real, running automated test — this sandbox has no
 * live Postgres to execute the actual SQL against. If the SQL's
 * formula ever changes, this mirror must change with it or the test
 * stops proving anything real.
 */
export interface ProfitabilityJobInput {
  revenue: number;
  actualCost: number;
  hasActualCostData: boolean;
}

export interface ServiceProfitabilityAggregate {
  totalJobs: number;
  jobsWithCostData: number;
  revenue: number;
  actualCost: number;
  grossProfit: number;
  grossMarginPercent: number | null;
  averageTicket: number | null;
}

/**
 * Mirrors getServiceProfitability's SQL exactly: revenue/cost/profit/
 * margin/averageTicket are computed ONLY from jobs where
 * hasActualCostData is true — never blended with jobs missing cost
 * data, and never treating a missing cost as $0. totalJobs is the only
 * figure that counts every job regardless of cost-data completeness.
 */
export function aggregateServiceProfitability(jobs: ProfitabilityJobInput[]): ServiceProfitabilityAggregate {
  const withCostData = jobs.filter((j) => j.hasActualCostData);
  const revenue = withCostData.reduce((sum, j) => sum + j.revenue, 0);
  const actualCost = withCostData.reduce((sum, j) => sum + j.actualCost, 0);
  const grossProfit = revenue - actualCost;

  return {
    totalJobs: jobs.length,
    jobsWithCostData: withCostData.length,
    revenue: round2(revenue),
    actualCost: round2(actualCost),
    grossProfit: round2(grossProfit),
    // Weighted — total gross profit ÷ total revenue — never the average
    // of each job's individual margin percentage. Averaging margins
    // would let a single small, high-margin job skew the service's
    // reported margin regardless of how little revenue it represents.
    grossMarginPercent: revenue > 0 ? Math.round((grossProfit / revenue) * 10000) / 100 : null,
    averageTicket: withCostData.length > 0 ? round2(revenue / withCostData.length) : null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
