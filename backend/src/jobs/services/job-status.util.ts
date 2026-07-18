// Phase 1 implements exactly the four transitions the approved plan
// calls for (start/pause/resume/complete). 'cancelled' and 'on_hold'
// already exist as real, valid statuses in the database — inherited from
// the original schema — but no action in this phase moves a job into
// either one. That's a deliberate scope decision, not an oversight:
// building a Cancel action means deciding what happens to a
// mid-progress job's line items, labor tracking, and any linked
// invoice — real product decisions Phase 1 was never asked to make.
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['in_progress'],
  scheduled: ['in_progress'],
  in_progress: ['paused', 'completed'],
  paused: ['in_progress'],
  completed: [],
  cancelled: [],
  on_hold: [],
};

export function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertValidTransition(from: string, to: string, actionLabel: string): void {
  if (!isValidTransition(from, to)) {
    throw new InvalidJobTransitionError(`Cannot ${actionLabel} a job with status '${from}'`);
  }
}

export class InvalidJobTransitionError extends Error {}

/**
 * Real elapsed hours between two timestamps, rounded to 2 decimal
 * places — the actual math behind calculatedLaborHours. A pure function
 * specifically so this can be tested against real clock-drift edge cases
 * (a job spanning midnight, a job under a minute) without a database.
 */
export function calculateLaborHours(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  const hours = ms / (1000 * 60 * 60);
  return Math.round(Math.max(hours, 0) * 100) / 100;
}
