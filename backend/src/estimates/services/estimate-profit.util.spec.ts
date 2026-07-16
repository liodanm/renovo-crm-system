import { computeLineItemProfit, resolveLaborRate } from './estimate-profit.util';

describe('resolveLaborRate', () => {
  it('uses the company default when no employee is assigned', () => {
    expect(resolveLaborRate(35, undefined)).toEqual({ rate: 35, source: 'company_default' });
    expect(resolveLaborRate(35, null)).toEqual({ rate: 35, source: 'company_default' });
  });

  it('uses the assigned employee rate when one exists, even if it differs a lot from the default', () => {
    expect(resolveLaborRate(35, 50)).toEqual({ rate: 50, source: 'employee' });
  });

  it('uses the employee rate even when it is explicitly zero — zero is a real rate, not "unset"', () => {
    // The one genuinely easy-to-get-wrong case: `0` is falsy in JS, so a
    // naive `assignedRate || companyDefault` would silently ignore a real
    // $0/hr override and fall back to the company default instead. This
    // implementation uses an explicit null/undefined check specifically
    // to avoid that.
    expect(resolveLaborRate(35, 0)).toEqual({ rate: 0, source: 'employee' });
  });
});

describe('computeLineItemProfit', () => {
  it('computes real profit correctly for a realistic roof wash line item', () => {
    // $840 charged, 2.5 hrs labor at $35/hr = $87.50, plus $28 chemicals
    const result = computeLineItemProfit(
      { lineTotal: 840, estimatedLaborHours: 2.5, estimatedChemicalCost: 28, estimatedEquipmentCost: 0, estimatedFuelCost: 0, estimatedMiscCost: 0 },
      35,
    );
    expect(result.laborCost).toBe(87.5);
    expect(result.totalCost).toBe(115.5);
    expect(result.estimatedProfit).toBe(724.5);
    // 724.50 / 840 = 86.25%
    expect(result.profitMarginPercent).toBe(86.25);
  });

  it('produces a negative profit when real costs exceed what was charged — a real, valid state to see, not an error', () => {
    const result = computeLineItemProfit(
      { lineTotal: 100, estimatedLaborHours: 5, estimatedChemicalCost: 20, estimatedEquipmentCost: 10, estimatedFuelCost: 5, estimatedMiscCost: 0 },
      35,
    );
    expect(result.totalCost).toBe(210); // 175 labor + 35 other costs
    expect(result.estimatedProfit).toBe(-110);
    expect(result.profitMarginPercent).toBe(-110);
  });

  it('returns a 0% margin for a zero-dollar line rather than dividing by zero', () => {
    const result = computeLineItemProfit(
      { lineTotal: 0, estimatedLaborHours: 1, estimatedChemicalCost: 0, estimatedEquipmentCost: 0, estimatedFuelCost: 0, estimatedMiscCost: 0 },
      35,
    );
    expect(Number.isFinite(result.profitMarginPercent)).toBe(true);
    expect(result.profitMarginPercent).toBe(0);
  });

  it('sums all five cost categories, not just labor and chemicals', () => {
    const result = computeLineItemProfit(
      { lineTotal: 1000, estimatedLaborHours: 0, estimatedChemicalCost: 10, estimatedEquipmentCost: 20, estimatedFuelCost: 30, estimatedMiscCost: 40 },
      35,
    );
    expect(result.totalCost).toBe(100); // 10 + 20 + 30 + 40, zero labor cost
  });
});
