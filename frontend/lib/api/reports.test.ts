import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveComparisonPeriod, resolvePreset } from './reports';

// All resolveComparisonPeriod cases use explicit, hand-picked start/end
// dates rather than relying on "now" — the function's whole contract is
// "given this period and this preset, produce the equivalent prior
// period," which is fully deterministic without needing to fake the
// clock. resolvePreset's own tests (further down) DO need a fixed
// clock, since that function derives start/end from Date.now() itself.

describe('resolveComparisonPeriod', () => {
  it('This Month — reproduces the exact bug report from the verification gate: Aug 1–19 must compare against Jul 1–19, not Jul 14–Aug 1', () => {
    const start = new Date(2026, 7, 1); // Aug 1, 2026
    const end = new Date(2026, 7, 19); // Aug 19, 2026
    const result = resolveComparisonPeriod(start, end, 'This Month');
    expect(result.start).toEqual(new Date(2026, 6, 1)); // Jul 1
    expect(result.end).toEqual(new Date(2026, 6, 19)); // Jul 19 — NOT Aug 1
  });

  it('Last Month — shifts back one full calendar month on both ends', () => {
    const start = new Date(2026, 6, 1); // Jul 1
    const end = new Date(2026, 7, 1); // Aug 1 (exclusive)
    const result = resolveComparisonPeriod(start, end, 'Last Month');
    expect(result.start).toEqual(new Date(2026, 5, 1)); // Jun 1
    expect(result.end).toEqual(new Date(2026, 6, 1)); // Jul 1
  });

  it('This Week — flat 7-day shift, not a duration-based one (duration would be wrong for a partial week)', () => {
    const start = new Date(2026, 7, 16); // Sun Aug 16
    const end = new Date(2026, 7, 19); // Wed Aug 19 — only 3 days into the week
    const result = resolveComparisonPeriod(start, end, 'This Week');
    // A duration-based shift (the original bug's approach) would give
    // Aug13-Aug16; the correct calendar-aligned answer is last week's
    // Sunday through last week's Wednesday.
    expect(result.start).toEqual(new Date(2026, 7, 9)); // Sun Aug 9
    expect(result.end).toEqual(new Date(2026, 7, 12)); // Wed Aug 12
  });

  it('Last Week — same flat 7-day shift', () => {
    const start = new Date(2026, 7, 9);
    const end = new Date(2026, 7, 16);
    const result = resolveComparisonPeriod(start, end, 'Last Week');
    expect(result.start).toEqual(new Date(2026, 7, 2));
    expect(result.end).toEqual(new Date(2026, 7, 9));
  });

  it('This Quarter — shifts back 3 calendar months, same day-of-quarter cutoff preserved', () => {
    const start = new Date(2026, 6, 1); // Jul 1 (Q3 start)
    const end = new Date(2026, 7, 19); // Aug 19 (partway through Q3)
    const result = resolveComparisonPeriod(start, end, 'This Quarter');
    expect(result.start).toEqual(new Date(2026, 3, 1)); // Apr 1 (Q2 start)
    expect(result.end).toEqual(new Date(2026, 4, 19)); // May 19
  });

  it('This Quarter — year-boundary edge case: Q1 must roll back into the previous year, not produce a negative month', () => {
    const start = new Date(2026, 0, 1); // Jan 1 (Q1 start)
    const end = new Date(2026, 1, 15); // Feb 15
    const result = resolveComparisonPeriod(start, end, 'This Quarter');
    // JS Date's own month-index rollover handles this — verified by
    // hand during the audit, confirmed here with a real assertion
    // rather than just asserted in prose.
    expect(result.start).toEqual(new Date(2025, 9, 1)); // Oct 1, 2025
    expect(result.end).toEqual(new Date(2025, 10, 15)); // Nov 15, 2025
  });

  it('Last Quarter — shifts back 3 more months from an already-prior quarter', () => {
    const start = new Date(2026, 3, 1); // Apr 1 (Q2 start)
    const end = new Date(2026, 6, 1); // Jul 1 (Q2 end, exclusive)
    const result = resolveComparisonPeriod(start, end, 'Last Quarter');
    expect(result.start).toEqual(new Date(2026, 0, 1)); // Jan 1
    expect(result.end).toEqual(new Date(2026, 3, 1)); // Apr 1
  });

  it('This Year — shifts back exactly one calendar year, same month/day preserved', () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 7, 19);
    const result = resolveComparisonPeriod(start, end, 'This Year');
    expect(result.start).toEqual(new Date(2025, 0, 1));
    expect(result.end).toEqual(new Date(2025, 7, 19));
  });

  it('Last Year — same one-year shift applied to an already-prior year', () => {
    const start = new Date(2025, 0, 1);
    const end = new Date(2026, 0, 1);
    const result = resolveComparisonPeriod(start, end, 'Last Year');
    expect(result.start).toEqual(new Date(2024, 0, 1));
    expect(result.end).toEqual(new Date(2025, 0, 1));
  });

  it('This Year — leap-year Feb 29 edge case: rolls to Mar 1 in the non-leap comparison year (standard JS Date behavior, not a bug in this function)', () => {
    const start = new Date(2024, 0, 1); // 2024 is a leap year
    const end = new Date(2024, 1, 29); // Feb 29, 2024 — valid, leap day
    const result = resolveComparisonPeriod(start, end, 'This Year');
    expect(result.start).toEqual(new Date(2023, 0, 1));
    // 2023 is not a leap year — Feb 29 doesn't exist, JS Date rolls
    // forward to Mar 1. Documented as accepted behavior, not "fixed"
    // here, since there's no semantically correct alternative answer.
    expect(result.end).toEqual(new Date(2023, 2, 1)); // Mar 1, 2023
  });

  it('Today / Yesterday — flat 1-day shift', () => {
    const start = new Date(2026, 7, 19, 0, 0, 0);
    const end = new Date(2026, 7, 19, 23, 59, 59);
    const result = resolveComparisonPeriod(start, end, 'Today');
    expect(result.start).toEqual(new Date(2026, 7, 18, 0, 0, 0));
    expect(result.end).toEqual(new Date(2026, 7, 18, 23, 59, 59));
  });

  it('Custom — the one case where a duration-based trailing window is actually correct, since there is no calendar unit to anchor to', () => {
    const start = new Date(2026, 7, 5);
    const end = new Date(2026, 7, 10); // 5-day custom range
    const result = resolveComparisonPeriod(start, end, 'Custom');
    expect(result.start).toEqual(new Date(2026, 6, 31)); // 5 days before Aug 5
    expect(result.end).toEqual(new Date(2026, 7, 5));
  });

  it('defaults to Custom (duration-based) behavior when no preset is given, for backward compatibility with any caller that predates the preset parameter', () => {
    const start = new Date(2026, 7, 1);
    const end = new Date(2026, 7, 19);
    const result = resolveComparisonPeriod(start, end);
    const durationMs = end.getTime() - start.getTime();
    expect(result.start.getTime()).toBe(start.getTime() - durationMs);
    expect(result.end.getTime()).toBe(start.getTime());
  });
});

describe('resolvePreset', () => {
  const REAL_NOW = new Date(2026, 7, 19, 14, 30, 0); // Wed Aug 19, 2026, 2:30 PM — a fixed, arbitrary "now" for every test below

  afterEach(() => {
    vi.useRealTimers();
  });

  function withFixedNow<T>(fn: () => T): T {
    vi.useFakeTimers();
    vi.setSystemTime(REAL_NOW);
    try {
      return fn();
    } finally {
      vi.useRealTimers();
    }
  }

  it('This Month — Aug 1 through the current moment', () => {
    const { start, end } = withFixedNow(() => resolvePreset('This Month'));
    expect(start).toEqual(new Date(2026, 7, 1));
    expect(end).toEqual(REAL_NOW);
  });

  it('This Quarter — Jul 1 (Q3 start) through the current moment', () => {
    const { start, end } = withFixedNow(() => resolvePreset('This Quarter'));
    expect(start).toEqual(new Date(2026, 6, 1));
    expect(end).toEqual(REAL_NOW);
  });

  it('This Year — Jan 1 through the current moment', () => {
    const { start } = withFixedNow(() => resolvePreset('This Year'));
    expect(start).toEqual(new Date(2026, 0, 1));
  });

  it('Yesterday — the full prior day, midnight to midnight', () => {
    const { start, end } = withFixedNow(() => resolvePreset('Yesterday'));
    expect(start).toEqual(new Date(2026, 7, 18, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 7, 19, 0, 0, 0, 0));
  });
});
