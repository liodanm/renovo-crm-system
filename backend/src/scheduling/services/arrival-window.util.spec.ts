import { resolveArrivalWindowMinutes, formatArrivalWindow, FALLBACK_ARRIVAL_WINDOW_MINUTES } from './arrival-window.util';

describe('resolveArrivalWindowMinutes', () => {
  it('uses the appointment override when set, even if a company default also exists', () => {
    expect(resolveArrivalWindowMinutes(60, 180)).toBe(60);
  });

  it('falls back to the company default when the appointment has none', () => {
    expect(resolveArrivalWindowMinutes(null, 90)).toBe(90);
    expect(resolveArrivalWindowMinutes(undefined, 90)).toBe(90);
  });

  it('falls back to the hardcoded constant only when neither is set', () => {
    expect(resolveArrivalWindowMinutes(null, null)).toBe(FALLBACK_ARRIVAL_WINDOW_MINUTES);
    expect(resolveArrivalWindowMinutes(undefined, undefined)).toBe(FALLBACK_ARRIVAL_WINDOW_MINUTES);
  });

  it('treats an explicit 0 as a real override, not "unset"', () => {
    // A genuine edge case worth locking down: `0 != null` is true, so a
    // company that deliberately sets a 0-minute window (exact-time
    // appointments only) must not be silently overridden by a fallback.
    expect(resolveArrivalWindowMinutes(0, 90)).toBe(0);
  });
});

describe('formatArrivalWindow', () => {
  it('computes the correct window end from a start time and duration', () => {
    const start = new Date('2026-07-20T09:00:00Z');
    const { windowStart, windowEnd } = formatArrivalWindow(start, 120);
    expect(windowStart.toISOString()).toBe('2026-07-20T09:00:00.000Z');
    expect(windowEnd.toISOString()).toBe('2026-07-20T11:00:00.000Z');
  });
});
