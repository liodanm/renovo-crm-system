import { computeEstimateTotals } from './estimate-totals.util';

describe('computeEstimateTotals', () => {
  it('computes a real three-line-item estimate correctly (roof, driveway, gutters)', () => {
    // $840 (roof) + $200 (driveway) + $225 (gutters) = $1265 subtotal —
    // the exact numbers verified against live Postgres during development.
    const result = computeEstimateTotals(1265, 'percentage', 10, 8.25);
    expect(result.subtotal).toBe(1265);
    expect(result.discountAmount).toBe(126.5);
    expect(result.taxAmount).toBe(93.93);
    expect(result.totalAmount).toBe(1232.43);
    expect(result.taxRateFraction).toBe(0.0825);
  });

  it('caps a flat discount at the subtotal — a total must never go negative', () => {
    const result = computeEstimateTotals(100, 'fixed', 500, 0);
    expect(result.discountAmount).toBe(100);
    expect(result.totalAmount).toBe(0);
  });

  it('returns the subtotal unchanged with no discount and no tax', () => {
    const result = computeEstimateTotals(1265);
    expect(result.discountAmount).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.totalAmount).toBe(1265);
  });

  it('applies a fixed discount correctly, distinct from a percentage discount', () => {
    const result = computeEstimateTotals(1000, 'fixed', 50, 0);
    expect(result.discountAmount).toBe(50);
    expect(result.totalAmount).toBe(950);
  });

  it('rounds to the nearest cent rather than accumulating floating-point drift', () => {
    // A value chosen specifically because naive floating-point math on it
    // produces a visible rounding artifact if not handled correctly.
    const result = computeEstimateTotals(19.99, undefined, undefined, 7);
    expect(Number.isInteger(result.taxAmount * 100)).toBe(true);
    expect(Number.isInteger(result.totalAmount * 100)).toBe(true);
  });

  it('does not apply a discount when discountType is set but discountValue is not', () => {
    const result = computeEstimateTotals(500, 'percentage', undefined, 0);
    expect(result.discountAmount).toBe(0);
    expect(result.totalAmount).toBe(500);
  });
});
