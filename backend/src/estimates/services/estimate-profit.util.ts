/**
 * The actual architecture behind "employee rate if assigned, otherwise
 * company default" — a pure function, deliberately, so the resolution
 * order itself is directly testable without a database. Nothing about
 * employee-specific rates is built as a feature yet (no UI assigns a line
 * item to an employee), but the function is already correct and ready:
 * the day an assignedUserId gets populated somewhere, this needs zero
 * changes to start using that employee's real rate instead of the
 * default.
 */
export interface ResolvedLaborRate {
  rate: number;
  source: 'employee' | 'company_default';
}

export function resolveLaborRate(companyDefaultRate: number, assignedUserHourlyRate: number | null | undefined): ResolvedLaborRate {
  if (assignedUserHourlyRate !== null && assignedUserHourlyRate !== undefined) {
    return { rate: assignedUserHourlyRate, source: 'employee' };
  }
  return { rate: companyDefaultRate, source: 'company_default' };
}

export interface LineItemCostInputs {
  lineTotal: number; // what the customer is actually charged for this line (quantity * unitPrice)
  estimatedLaborHours: number;
  estimatedChemicalCost: number;
  estimatedEquipmentCost: number;
  estimatedFuelCost: number;
  estimatedMiscCost: number;
}

export interface LineItemProfitResult {
  laborCost: number;
  totalCost: number;
  estimatedProfit: number;
  profitMarginPercent: number;
}

/**
 * `laborRate` is the already-resolved number from resolveLaborRate() —
 * kept as a separate parameter (not resolved inside this function) so the
 * two concerns stay independently testable: "which rate applies" and
 * "given a rate, what's the profit" are different questions with
 * different edge cases.
 */
export function computeLineItemProfit(inputs: LineItemCostInputs, laborRate: number): LineItemProfitResult {
  const laborCost = inputs.estimatedLaborHours * laborRate;
  const totalCost = laborCost + inputs.estimatedChemicalCost + inputs.estimatedEquipmentCost + inputs.estimatedFuelCost + inputs.estimatedMiscCost;
  const estimatedProfit = inputs.lineTotal - totalCost;
  // A $0 line (shouldn't happen given the create DTO requires a positive
  // unitPrice/quantity, but defensive regardless) has no meaningful
  // margin percentage — 0, not a divide-by-zero NaN or Infinity leaking
  // into a stored NUMERIC column.
  const profitMarginPercent = inputs.lineTotal > 0 ? (estimatedProfit / inputs.lineTotal) * 100 : 0;

  return {
    laborCost: round2(laborCost),
    totalCost: round2(totalCost),
    estimatedProfit: round2(estimatedProfit),
    profitMarginPercent: round2(profitMarginPercent),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
