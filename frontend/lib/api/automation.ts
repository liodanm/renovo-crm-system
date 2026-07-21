import { apiFetch } from './api-client';

export interface AutomationTemplate {
  subject?: string;
  body?: string;
}

export interface AutomationSettings {
  companyId: string;
  estimateFollowupEnabled: boolean;
  estimateFollowupAfterDays: number;
  recurringReminderEnabled: boolean;
  recurringReminderIntervalMonths: number;
  reviewRequestEnabled: boolean;
  reviewRequestDelayDays: number;
  paymentReminderEnabled: boolean;
  paymentReminderDaysAfterDue: number;
  estimateExpirationReminderEnabled: boolean;
  estimateExpirationReminderDaysBefore: number;
  jobThankYouEnabled: boolean;
  templates: Record<string, AutomationTemplate>;
}

export interface AutomationLogEntry {
  id: string;
  customerId: string | null;
  ruleType: string;
  channel: string;
  messageBody: string;
  status: string;
  sentAt: string;
}

export const automationApi = {
  getSettings: () => apiFetch<AutomationSettings>('/automation/settings'),
  updateSettings: (input: Partial<AutomationSettings>) => apiFetch<AutomationSettings>('/automation/settings', { method: 'PATCH', body: JSON.stringify(input) }),
  getLog: () => apiFetch<AutomationLogEntry[]>('/automation/log'),
  runNow: () => apiFetch<{ sent: number; failed: number }>('/automation/run-now', { method: 'POST' }),
};

export const AUTOMATION_RULES = [
  { key: 'estimate_followup', label: 'Estimate Follow-Up', description: 'Nudge a customer who hasn\u2019t responded to a sent estimate.' },
  { key: 'estimate_expiration_reminder', label: 'Estimate Expiration Reminder', description: 'Remind a customer before their estimate expires.' },
  { key: 'recurring_reminder', label: 'Recurring Service Reminder', description: 'Reach out to bring a past customer back for another cleaning.' },
  { key: 'job_thank_you', label: 'Job Thank-You', description: 'A simple thank-you message right after a job is completed.' },
  { key: 'review_request', label: 'Review Request', description: 'Ask for a Google review a short while after completion.' },
  { key: 'payment_reminder', label: 'Payment Reminder', description: 'Remind a customer about a past-due invoice.' },
] as const;
