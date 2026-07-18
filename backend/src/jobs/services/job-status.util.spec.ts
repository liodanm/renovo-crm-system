import { isValidTransition, calculateLaborHours, assertValidTransition, InvalidJobTransitionError } from './job-status.util';

describe('isValidTransition', () => {
  it('allows the four Phase 1 actions', () => {
    expect(isValidTransition('draft', 'in_progress')).toBe(true); // Start
    expect(isValidTransition('scheduled', 'in_progress')).toBe(true); // Start
    expect(isValidTransition('in_progress', 'paused')).toBe(true); // Pause
    expect(isValidTransition('paused', 'in_progress')).toBe(true); // Resume
    expect(isValidTransition('in_progress', 'completed')).toBe(true); // Complete
  });

  it('rejects completing a job that never started', () => {
    expect(isValidTransition('draft', 'completed')).toBe(false);
    expect(isValidTransition('scheduled', 'completed')).toBe(false);
  });

  it('rejects skipping resume — a paused job cannot complete directly', () => {
    expect(isValidTransition('paused', 'completed')).toBe(false);
  });

  it('rejects un-completing a job — completed is terminal in Phase 1', () => {
    expect(isValidTransition('completed', 'in_progress')).toBe(false);
    expect(isValidTransition('completed', 'draft')).toBe(false);
  });

  it('rejects pausing a job that was never started', () => {
    expect(isValidTransition('draft', 'paused')).toBe(false);
    expect(isValidTransition('scheduled', 'paused')).toBe(false);
  });
});

describe('assertValidTransition', () => {
  it('throws a clear, specific error naming the actual blocking status', () => {
    expect(() => assertValidTransition('completed', 'in_progress', 'resume')).toThrow(InvalidJobTransitionError);
    expect(() => assertValidTransition('completed', 'in_progress', 'resume')).toThrow(/status 'completed'/);
  });

  it('does not throw for a valid transition', () => {
    expect(() => assertValidTransition('draft', 'in_progress', 'start')).not.toThrow();
  });
});

describe('calculateLaborHours', () => {
  it('computes a real multi-hour job correctly', () => {
    const start = new Date('2026-07-18T08:00:00Z');
    const end = new Date('2026-07-18T11:30:00Z');
    expect(calculateLaborHours(start, end)).toBe(3.5);
  });

  it('handles a job spanning midnight correctly', () => {
    const start = new Date('2026-07-18T23:00:00Z');
    const end = new Date('2026-07-19T01:00:00Z');
    expect(calculateLaborHours(start, end)).toBe(2);
  });

  it('never returns negative hours from bad or reversed data', () => {
    const start = new Date('2026-07-18T11:00:00Z');
    const end = new Date('2026-07-18T08:00:00Z'); // end before start
    expect(calculateLaborHours(start, end)).toBe(0);
  });

  it('rounds to 2 decimal places rather than leaving long floats', () => {
    const start = new Date('2026-07-18T08:00:00Z');
    const end = new Date('2026-07-18T08:20:00Z'); // 20 minutes = 0.3333... hours
    const result = calculateLaborHours(start, end);
    expect(Number.isInteger(result * 100)).toBe(true);
    expect(result).toBe(0.33);
  });
});
