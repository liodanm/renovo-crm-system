import { computeJobLineItemActualProfit } from './job-profit.util';

describe('computeJobLineItemActualProfit', () => {
  it('returns all-null, hasAnyActualCost: false when nothing has been recorded yet — the "not yet known" state, not a confident zero', () => {
    const result = computeJobLineItemActualProfit(
      { lineTotal: 500, actualLaborHours: null, actualChemicalCost: null, actualEquipmentCost: null, actualFuelCost: null, actualMiscCost: null },
      35,
    );
    expect(result.hasAnyActualCost).toBe(false);
    expect(result.laborCost).toBeNull();
    expect(result.totalCost).toBeNull();
    expect(result.actualProfit).toBeNull();
    expect(result.actualProfitMarginPercent).toBeNull();
  });

  it('reproduces the audit approval doc\'s own worked example exactly: $500 revenue, $190 actual cost, $310 actual profit', () => {
    // Revenue = $500, Actual Cost = $190, Actual Profit = $310 — the
    // exact numbers given in the approval document as the target
    // behavior for this function.
    const result = computeJobLineItemActualProfit(
      { lineTotal: 500, actualLaborHours: 4, actualChemicalCost: 30, actualEquipmentCost: 20, actualFuelCost: 0, actualMiscCost: 0 },
      35, // 4 hrs * $35 = $140 labor + $30 chemical + $20 equipment = $190
    );
    expect(result.hasAnyActualCost).toBe(true);
    expect(result.laborCost).toBe(140);
    expect(result.totalCost).toBe(190);
    expect(result.actualProfit).toBe(310);
    expect(result.actualProfitMarginPercent).toBe(62); // 310 / 500 = 62%
  });

  it('treats a single recorded category as real data — hasAnyActualCost is true even with only one of five fields set', () => {
    const result = computeJobLineItemActualProfit(
      { lineTotal: 500, actualLaborHours: null, actualChemicalCost: 30, actualEquipmentCost: null, actualFuelCost: null, actualMiscCost: null },
      35,
    );
    expect(result.hasAnyActualCost).toBe(true);
    expect(result.laborCost).toBe(0); // no hours recorded → $0 labor cost, not null, once ANY category is known
    expect(result.totalCost).toBe(30);
    expect(result.actualProfit).toBe(470);
  });

  it('produces a negative profit when real costs exceed what was charged — a real, valid state, matching the estimate-side behavior exactly', () => {
    const result = computeJobLineItemActualProfit(
      { lineTotal: 100, actualLaborHours: 5, actualChemicalCost: 20, actualEquipmentCost: 10, actualFuelCost: 5, actualMiscCost: 0 },
      35,
    );
    expect(result.totalCost).toBe(210); // 175 labor + 35 other costs
    expect(result.actualProfit).toBe(-110);
    expect(result.actualProfitMarginPercent).toBe(-110);
  });

  it('returns a 0% margin for a zero-dollar line rather than dividing by zero', () => {
    const result = computeJobLineItemActualProfit(
      { lineTotal: 0, actualLaborHours: 1, actualChemicalCost: 0, actualEquipmentCost: 0, actualFuelCost: 0, actualMiscCost: 0 },
      35,
    );
    expect(Number.isFinite(result.actualProfitMarginPercent as number)).toBe(true);
    expect(result.actualProfitMarginPercent).toBe(0);
  });

  it('sums all four non-labor cost categories plus labor, not just a subset', () => {
    const result = computeJobLineItemActualProfit(
      { lineTotal: 1000, actualLaborHours: 0, actualChemicalCost: 10, actualEquipmentCost: 20, actualFuelCost: 30, actualMiscCost: 40 },
      35,
    );
    expect(result.totalCost).toBe(100); // 10 + 20 + 30 + 40, zero labor cost
  });

  it('rounds to the nearest cent rather than accumulating floating-point drift', () => {
    const result = computeJobLineItemActualProfit(
      { lineTotal: 19.99, actualLaborHours: 0.3333, actualChemicalCost: null, actualEquipmentCost: null, actualFuelCost: null, actualMiscCost: null },
      7,
    );
    expect(Number.isInteger((result.totalCost as number) * 100)).toBe(true);
    expect(Number.isInteger((result.actualProfit as number) * 100)).toBe(true);
  });
});
