// The one hardcoded number in this whole chain, deliberately isolated
// here — appointment override and company default are both genuinely
// optional in the database (per explicit instruction: "do not hardcode
// arrival windows"). This constant is only ever reached when NEITHER
// has been set by anyone, and the moment Business Settings exists and a
// company sets its own default, this line stops mattering for them.
export const FALLBACK_ARRIVAL_WINDOW_MINUTES = 120;

export function resolveArrivalWindowMinutes(appointmentOverride: number | null | undefined, companyDefault: number | null | undefined): number {
  if (appointmentOverride != null) return appointmentOverride;
  if (companyDefault != null) return companyDefault;
  return FALLBACK_ARRIVAL_WINDOW_MINUTES;
}

/**
 * "9:00 AM - 11:00 AM" style label from a start time + window length —
 * what the calendar and quick-actions panel actually display.
 */
export function formatArrivalWindow(startsAt: Date, windowMinutes: number): { windowStart: Date; windowEnd: Date } {
  const windowStart = new Date(startsAt);
  const windowEnd = new Date(startsAt.getTime() + windowMinutes * 60 * 1000);
  return { windowStart, windowEnd };
}
