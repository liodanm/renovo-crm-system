// Tracks which customers were recently selected/created while working on
// estimates, so the customer picker can surface "who I was just talking
// to" first. Deliberately local-only (localStorage) — this is a per-device
// convenience, not business data, so it doesn't belong in Postgres and
// doesn't need a new endpoint, table, or migration.

const STORAGE_KEY = 'renovo:recent-customer-ids';
const MAX_ENTRIES = 20;

export function getRecentCustomerIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function recordRecentCustomer(customerId: string): void {
  if (typeof window === 'undefined' || !customerId) return;
  try {
    const existing = getRecentCustomerIds().filter((id) => id !== customerId);
    const next = [customerId, ...existing].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage can throw in private-browsing/quota-exceeded edge
    // cases — this is a convenience feature, never worth breaking the
    // actual estimate flow over.
  }
}
