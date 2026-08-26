import { apiFetch } from './api-client';

export interface TodaysJob {
  id: string;
  title: string;
  status: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  customerName: string;
  address: string;
  crewName: string | null;
  price: number;
}

export interface OverdueInvoice {
  id: string;
  invoiceNumber: string;
  balanceDue: string;
  dueDate: string;
  daysOverdue: number;
  customerName: string;
}

export interface FollowUpCandidate {
  id: string;
  estimateNumber: string;
  totalAmount: string;
  sentAt: string;
  daysSinceSent: number;
  customerName: string;
}

export interface RecurringOverdueCandidate {
  propertyId: string;
  addressLine1: string;
  customerId: string;
  customerName: string;
  lastServiceDate: string;
  daysOverdue: number;
}

export interface DashboardSummary {
  todaysJobs: { count: number; completedCount: number; jobs: TodaysJob[] } | null;
  todaysRevenue: { total: number; paymentCount: number } | null;
  pendingEstimates: { count: number; totalValue: number; olderThan3Days: number } | null;
  openLeads: { count: number; staleCount: number } | null;
  recentPayments: Array<{
    id: string;
    amount: number;
    method: string;
    processedAt: string;
    customerName: string;
  }> | null;
  // Dashboard 2.0 — every field below is composed from an existing
  // ReportsService method server-side, not recalculated here.
  snapshotKpis: {
    revenueToday: string; revenueThisWeek: string; revenueThisMonth: string; revenueThisYear: string;
    outstandingInvoices: string; overdueInvoices: string; overdueInvoiceCount: string;
    paymentsReceivedThisMonth: string;
  } | null;
  receivablesAging: { current: string; days1To30: string; days31To60: string; days60Plus: string } | null;
  topOverdueInvoices: OverdueInvoice[] | null;
  estimatePipeline: { status: string; count: string; totalValue: string }[] | null;
  conversion: { total: number; accepted: number; declined: number; pending: number; expired: number; conversionRatePercent: number | null } | null;
  followUpCandidates: FollowUpCandidate[] | null;
  recurringOverdueCandidates: RecurringOverdueCandidate[] | null;
}

export interface CalendarJob {
  id: string;
  title: string;
  status: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  customerName: string;
  address: string;
  crewName: string | null;
}

export interface MapProperty {
  id: string;
  customerId: string;
  latitude: number;
  longitude: number;
  address: string;
  customerName: string;
  leadStatus: string;
  lastJobStatus: string | null;
  lastJobDate: string | null;
  lastJobPriority: 'normal' | 'follow_up' | 'high' | 'emergency' | null;
}

export interface WeatherSnapshot {
  location: { latitude: number; longitude: number };
  current: {
    temperatureF: number;
    windSpeedMph: number;
    precipitationInches: number;
    condition: string;
    conditionCode: number;
    isDay: boolean;
  };
  daily: Array<{
    date: string;
    highF: number;
    lowF: number;
    precipitationProbabilityPct: number;
    condition: string;
  }>;
  workAdvisory: { isRisky: boolean; reason: string | null };
}

export interface DashboardNotification {
  id: string;
  notificationType: string;
  title: string;
  body: string | null;
  status: string;
  readAt: string | null;
  createdAt: string;
}

export interface AiSuggestion {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  actionLabel?: string;
  actionHref?: string;
}

export interface GoogleReviewsData {
  enabled: boolean;
  rating: number | null;
  userRatingsTotal: number | null;
  reviews: Array<{ author: string; rating: number; text: string; relativeTime: string }> | null;
  error?: string;
}

export const dashboardApi = {
  getSummary: () => apiFetch<DashboardSummary>('/dashboard/summary'),

  getCalendar: (start: Date, end: Date) =>
    apiFetch<CalendarJob[]>(`/dashboard/calendar?start=${start.toISOString()}&end=${end.toISOString()}`),

  getMap: () => apiFetch<MapProperty[]>('/dashboard/map'),

  getWeather: (lat: number, lng: number) => apiFetch<WeatherSnapshot | null>(`/dashboard/weather?lat=${lat}&lng=${lng}`),

  getNotifications: () => apiFetch<{ unreadCount: number; notifications: DashboardNotification[] }>('/dashboard/notifications'),

  getAiSuggestions: () => apiFetch<AiSuggestion[]>('/dashboard/ai-suggestions'),

  getGoogleReviews: () => apiFetch<GoogleReviewsData>('/dashboard/google-reviews'),
};
