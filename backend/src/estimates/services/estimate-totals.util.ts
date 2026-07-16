export interface ComputedEstimateTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  taxRateFraction: number;
}

/**
 * Deliberately a pure function — no database, no NestJS, no side effects.
 * This is what makes it possible to test the actual money math directly,
 * fast, and without needing a live Postgres connection, unlike everything
 * else in this service (which genuinely does need one, and is verified
 * that way instead — see estimates.service.spec.ts for what's tested here
 * versus docs/API_ESTIMATES.md for what's verified against a live database).
 */
export function computeEstimateTotals(subtotal: number, discountType?: string, discountValue?: number, taxRatePercent?: number): ComputedEstimateTotals {
  let discountAmount = 0;
  if (discountType && discountValue) {
    discountAmount = discountType === 'percentage' ? subtotal * (discountValue / 100) : discountValue;
    // A flat discount can never exceed the subtotal — negative totals are
    // never a valid state for an estimate a customer is meant to pay.
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
