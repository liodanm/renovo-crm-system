/**
 * The job-side equivalent of estimate-profit.util.ts's
 * computeLineItemProfit — deliberately the same shape, same rounding
 * convention, same pure-function design, per the reporting-foundation
 * approval doc's explicit instruction to reuse the established
 * architecture rather than invent a second one. resolveLaborRate()
 * itself is reused as-is from estimate-profit.util.ts (import it
 * directly at the call site) rather than duplicated here — "which rate
 * applies" is exactly the same question for a job line item as for an
 * estimate line item, with no job-specific variation.
 *
 * The one real difference from the estimate side: every cost input here
 * is `number | null`, not `number`. An estimate line item's estimated
 * costs are always populated (default 0) the moment the line item is
 * created — there's nothing to wait for. A job line item's ACTUAL costs
 * start out genuinely unknown and are filled in as real work happens;
 * treating "not recorded yet" as 0 would silently understate cost the
 * instant a report ran before every cost category had been entered.
 * hasAnyActualCost / hasCompleteActualCost below exist specifically so
 * callers (and eventually the reporting layer) can tell "no actual cost
 * data yet" apart from "actual cost data, and it happens to be $310.50."
 */
export interface JobLineItemActualCostInputs {
  lineTotal: number; // what the customer is actually charged for this line (quantity * unitPrice) — same meaning as the estimate side
  actualLaborHours: number | null;
  actualChemicalCost: number | null;
  actualEquipmentCost: number | null;
  actualFuelCost: number | null;
  actualMiscCost: number | null;
}

export interface JobLineItemProfitResult {
  /** True the moment at least one actual* field is non-null — "some real data exists," not "complete data exists." */
  hasAnyActualCost: boolean;
  laborCost: number | null;
  totalCost: number | null;
  actualProfit: number | null;
  actualProfitMarginPercent: number | null;
}

/**
 * `laborRate` is the already-resolved number from resolveLaborRate()
 * (estimate-profit.util.ts), same as the estimate side — kept as a
 * separate parameter for the same reason: "which rate applies" and
 * "given a rate and known costs, what's the profit" are independently
 * testable questions.
 *
 * Null-category treatment: any category left null (not yet recorded) is
 * treated as $0 ONLY for the purpose of computing totalCost/profit from
 * whatever IS known — it is never reported back as if it were a real,
 * confirmed $0. This mirrors real bookkeeping: a job cost report built
 * from partial data should show the best-known total, while
 * hasAnyActualCost/the underlying null fields remain the signal that the
 * figure may still be incomplete. If every category is null, this
 * function returns null results across the board rather than a
 * misleadingly confident "$0 cost, 100% margin."
 */
export function computeJobLineItemActualProfit(inputs: JobLineItemActualCostInputs, laborRate: number): JobLineItemProfitResult {
  const hasAnyActualCost =
    inputs.actualLaborHours !== null ||
    inputs.actualChemicalCost !== null ||
    inputs.actualEquipmentCost !== null ||
    inputs.actualFuelCost !== null ||
    inputs.actualMiscCost !== null;

  if (!hasAnyActualCost) {
    return { hasAnyActualCost: false, laborCost: null, totalCost: null, actualProfit: null, actualProfitMarginPercent: null };
  }

  const laborCost = (inputs.actualLaborHours ?? 0) * laborRate;
  const totalCost =
    laborCost + (inputs.actualChemicalCost ?? 0) + (inputs.actualEquipmentCost ?? 0) + (inputs.actualFuelCost ?? 0) + (inputs.actualMiscCost ?? 0);
  const actualProfit = inputs.lineTotal - totalCost;
  const actualProfitMarginPercent = inputs.lineTotal > 0 ? (actualProfit / inputs.lineTotal) * 100 : 0;

  return {
    hasAnyActualCost: true,
    laborCost: round2(laborCost),
    totalCost: round2(totalCost),
    actualProfit: round2(actualProfit),
    actualProfitMarginPercent: round2(actualProfitMarginPercent),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
