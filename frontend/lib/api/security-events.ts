import { apiFetch } from './api-client';

export type SecurityEventType =
  | 'login_success' | 'login_failure' | 'account_locked' | 'logout'
  | 'password_reset_request' | 'password_reset_completed'
  | 'registration_success' | 'registration_duplicate_attempt'
  | 'invitation_sent' | 'invitation_accepted';

export interface SecurityEvent {
  id: string;
  eventType: SecurityEventType;
  success: boolean;
  identifierMasked: string | null;
  userName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface SecurityEventsPage {
  events: SecurityEvent[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SecurityEventsSummary {
  successfulLogins: number;
  failedLoginAttempts: number;
  accountLockouts: number;
  newRegistrations: number;
  staffAccessChanges: number;
}

function qs(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') usp.set(k, String(v));
  return usp.toString();
}

export const securityEventsApi = {
  list: (filters: { eventType?: string; success?: string; start?: string; end?: string; page?: number; pageSize?: number }) =>
    apiFetch<SecurityEventsPage>(`/security-events?${qs(filters)}`),
  summary: (start: string, end: string) => apiFetch<SecurityEventsSummary>(`/security-events/summary?${qs({ start, end })}`),
  suspicious: () => apiFetch<{ repeatedFailedLoginIdentifiers: string[] }>('/security-events/suspicious'),
};

/** Human-readable label per event type — one place, reused by the table and the filter dropdown. */
export const SECURITY_EVENT_LABELS: Record<SecurityEventType, string> = {
  login_success: 'Login',
  login_failure: 'Login failed',
  account_locked: 'Account locked',
  logout: 'Logout',
  password_reset_request: 'Password reset requested',
  password_reset_completed: 'Password reset',
  registration_success: 'New registration',
  registration_duplicate_attempt: 'Duplicate registration attempt',
  invitation_sent: 'Staff invitation sent',
  invitation_accepted: 'Staff invitation accepted',
};
