export interface ComputedDocumentTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  taxRateFraction: number;
}

/**
 * The one, single implementation of subtotal -> discount -> tax ->
 * total math for every priced document in this app (Estimates,
 * Invoices, and anything billed like them later). Originally lived
 * only in the estimates module; moved here once Invoices needed the
 * exact same calculation — duplicating identical financial math across
 * two modules is precisely the kind of thing "keep calculations
 * consistent throughout the application" rules out.
 *
 * Deliberately pure — no database, no NestJS — so the actual money math
 * is directly testable without a live Postgres connection.
 */
export function computeDocumentTotals(subtotal: number, discountType?: string, discountValue?: number, taxRatePercent?: number): ComputedDocumentTotals {
  let discountAmount = 0;
  if (discountType && discountValue) {
    discountAmount = discountType === 'percentage' ? subtotal * (discountValue / 100) : discountValue;
    // A flat discount can never exceed the subtotal — negative totals
    // are never a valid state for a document a customer is meant to pay.
    discountAmount = Math.min(discountAmount, subtotal);
  }

  const taxableAmount = subtotal - discountAmount;
  const taxRateFraction = (taxRatePercent ?? 0) / 100;
  const taxAmount = taxableAmount * taxRateFraction;
  const totalAmount = taxableAmount + taxAmount;

  return {
    subtotal: round2(subtotal),
    discountAmount: round2(discountAmount),
    taxAmount: round2(taxAmount),
    totalAmount: round2(totalAmount),
    taxRateFraction,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
