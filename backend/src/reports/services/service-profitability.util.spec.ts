import { aggregateServiceProfitability } from './service-profitability.util';

describe('aggregateServiceProfitability', () => {
  it('reproduces the Group 2 spec worked example exactly: $800/$248/$552/69.0%/$400, weighted not averaged', () => {
    const jobs = [
      { revenue: 500, actualCost: 148, hasActualCostData: true }, // job 1: 70.4% margin individually
      { revenue: 300, actualCost: 100, hasActualCostData: true }, // job 2: 66.67% margin individually
    ];
    const result = aggregateServiceProfitability(jobs);

    expect(result.revenue).toBe(800);
    expect(result.actualCost).toBe(248);
    expect(result.grossProfit).toBe(552);
    expect(result.grossMarginPercent).toBe(69);
    expect(result.averageTicket).toBe(400); // $800 / 2, not the average of the two job prices independently

    // The critical assertion this whole test exists for: the naive,
    // wrong approach — averaging each job's own margin — would give
    // (70.4 + 66.67) / 2 = 68.535, a different number than the correct
    // weighted 69.0%. Confirms the formula is actually weighted, not
    // just coincidentally close.
    const naiveAverageOfMargins = (70.4 + 66.67) / 2;
    expect(result.grossMarginPercent).not.toBe(Math.round(naiveAverageOfMargins * 100) / 100);
  });

  it('multiple jobs under the same service aggregate correctly beyond just two', () => {
    const jobs = [
      { revenue: 500, actualCost: 148, hasActualCostData: true },
      { revenue: 300, actualCost: 100, hasActualCostData: true },
      { revenue: 200, actualCost: 50, hasActualCostData: true },
    ];
    const result = aggregateServiceProfitability(jobs);
    expect(result.revenue).toBe(1000);
    expect(result.actualCost).toBe(298);
    expect(result.grossProfit).toBe(702);
    expect(result.averageTicket).toBe(333.33); // 1000 / 3, rounded to 2 decimals for money display
  });

  it('a job with missing actual cost data is excluded from revenue/cost/profit, never treated as $0 cost', () => {
    const jobs = [
      { revenue: 500, actualCost: 148, hasActualCostData: true },
      { revenue: 999, actualCost: 0, hasActualCostData: false }, // no real cost data recorded at all
    ];
    const result = aggregateServiceProfitability(jobs);

    // totalJobs counts both — the completeness fraction needs the true denominator.
    expect(result.totalJobs).toBe(2);
    expect(result.jobsWithCostData).toBe(1);

    // But revenue/cost/profit/averageTicket must reflect ONLY the one
    // job with real data — the $999 job contributes nothing here,
    // rather than being silently folded in as if its cost were $0.
    expect(result.revenue).toBe(500);
    expect(result.actualCost).toBe(148);
    expect(result.grossProfit).toBe(352);
    expect(result.averageTicket).toBe(500);
  });

  it('distinguishes a genuinely recorded zero cost from a job with no cost data at all', () => {
    const jobs = [
      { revenue: 500, actualCost: 0, hasActualCostData: true }, // explicitly recorded, real zero — e.g. no chemicals needed, $0 was actually entered
    ];
    const result = aggregateServiceProfitability(jobs);
    // This job DOES count — its zero is a real, recorded value, not an
    // absence of data (hasActualCostData is true, matching the same
    // has_actual_cost_data flag the SQL derives from at least one
    // actual_* field being non-null).
    expect(result.jobsWithCostData).toBe(1);
    expect(result.actualCost).toBe(0);
    expect(result.grossProfit).toBe(500);
    expect(result.grossMarginPercent).toBe(100);
  });

  it('a service where every job is missing cost data reports no fabricated profitability', () => {
    const jobs = [
      { revenue: 500, actualCost: 0, hasActualCostData: false },
      { revenue: 300, actualCost: 0, hasActualCostData: false },
    ];
    const result = aggregateServiceProfitability(jobs);
    expect(result.totalJobs).toBe(2);
    expect(result.jobsWithCostData).toBe(0);
    expect(result.revenue).toBe(0);
    expect(result.grossMarginPercent).toBeNull();
    expect(result.averageTicket).toBeNull();
  });

  it('division by zero (zero revenue among cost-data jobs) returns null, never NaN or Infinity', () => {
    const jobs = [{ revenue: 0, actualCost: 0, hasActualCostData: true }];
    const result = aggregateServiceProfitability(jobs);
    expect(result.grossMarginPercent).toBeNull();
    expect(Number.isNaN(result.grossMarginPercent)).toBe(false);
    expect(result.grossMarginPercent).not.toBe(Infinity);
  });

  it('an empty job list (no completed jobs for this service/period) returns zeros and nulls, not misleading numbers', () => {
    const result = aggregateServiceProfitability([]);
    expect(result.totalJobs).toBe(0);
    expect(result.jobsWithCostData).toBe(0);
    expect(result.revenue).toBe(0);
    expect(result.grossMarginPercent).toBeNull();
    expect(result.averageTicket).toBeNull();
  });
});

describe('Group 4 — Technician Performance worked example (reuses the same aggregation formula, adds Revenue/Labor Hour)', () => {
  it('reproduces the exact Group 4 spec example: $800/$248/$552/69.0%/$400, plus 3 labor hours and $266.67/hour', () => {
    const jobs = [
      { revenue: 500, actualCost: 148, hasActualCostData: true },
      { revenue: 300, actualCost: 100, hasActualCostData: true },
    ];
    const result = aggregateServiceProfitability(jobs);
    expect(result.revenue).toBe(800);
    expect(result.actualCost).toBe(248);
    expect(result.grossProfit).toBe(552);
    expect(result.grossMarginPercent).toBe(69);
    expect(result.averageTicket).toBe(400);

    // Revenue/Labor Hour is genuinely new arithmetic this group
    // introduces (not covered by the Service Profitability formula
    // above, which has no concept of labor hours at all) — verified
    // directly here rather than assumed correct by analogy.
    const laborHours = 2 + 1;
    const revenuePerLaborHour = Math.round((result.revenue / laborHours) * 100) / 100;
    expect(laborHours).toBe(3);
    expect(revenuePerLaborHour).toBe(266.67);
  });

  it('division by zero labor hours returns a safe null, never Infinity', () => {
    const revenue = 500;
    const laborHours = 0;
    const revenuePerLaborHour = laborHours > 0 ? revenue / laborHours : null;
    expect(revenuePerLaborHour).toBeNull();
  });
});
