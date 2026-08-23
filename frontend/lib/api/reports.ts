import { apiFetch } from './api-client';

export interface SnapshotKpis {
  revenueToday: string;
  revenueThisWeek: string;
  revenueThisMonth: string;
  revenueThisYear: string;
  outstandingInvoices: string;
  overdueInvoices: string;
  overdueInvoiceCount: string;
  paymentsReceivedThisMonth: string;
  taxesCollectedThisMonth: string;
  profit: { estimatedProfitThisMonth: number; profitMarginPercent: number | null } | null;
}

export interface PeriodKpis {
  estimateConversionRatePercent: number | null;
  estimatesSent: number;
  estimatesAccepted: number;
  averageTicket: string; // Completed Job Revenue ÷ Completed Jobs — see REPORTING_DEFINITIONS.md. Fixed by the reporting verification gate; previously sourced from accepted estimates.
  averageAcceptedEstimateValue: string; // The metric averageTicket used to be — preserved under its own honest name, not deleted.
  acceptedEstimateValue: string;
  jobsCompleted: string;
  jobsScheduled: string;
  averageJobDurationHours: string;
  totalLaborHours: string;
}

export interface TrendPoint { date: string; revenue?: string; amount?: string; jobsCompleted?: string }
export interface RevenueByService { serviceName: string; revenue: string; invoiceCount: string }
export interface RevenueByCustomer { customerId: string; customerName: string; revenue: string; invoiceCount: string }
export interface LeadSourceAnalytics {
  source: string;
  leadCount: string;
  convertedCount: string;
  totalRevenue: string;
  averageRevenuePerCustomer: string;
  invoiceCount: string;
  averageTicket: string;
  averageLifetimeValue: string;
  totalLifetimeValue: string;
  repeatCustomerCount: string;
}
export interface LeadSourceTrendPoint { month: string; source: string; leadCount: string }
export interface PipelineStage { status: string; count: string; totalValue: string }
export interface CustomerAnalytics {
  repeatCustomerCount: number;
  totalActiveCustomers: number;
  repeatCustomerRatePercent: number | null;
  averageLifetimeValue: number;
  averageDaysBetweenServices: number;
}
export interface TechnicianPerformance {
  technicianId: string;
  firstName: string | null;
  lastName: string | null;
  jobsCompleted: string;
  averageJobDurationHours: string;
  totalLaborHours: string;
}
export interface ChemicalUsage { chemicalName: string; unit: string; totalQuantity: string; jobCount: string }
export interface EquipmentUsage { equipmentName: string; usageCount: string; jobCount: string }
export interface ReceivablesAging { current: string; days1To30: string; days31To60: string; days60Plus: string }
export interface MonthlyProfitPoint { month: string; profit: string; revenue: string }

export interface JobCostSummary {
  completedJobs: number;
  jobsWithCostData: number;
  completeJobs: number;
  totalRevenue: number;
  totalActualCost: number;
  totalGrossProfit: number | null;
  grossMarginPercent: number | null;
}

export interface JobCostDetailRow {
  jobId: string;
  jobNumber: string;
  customerName: string;
  completedAt: string;
  revenue: string;
  actualCost: string;
  laborCost: string;
  chemicalCost: string;
  equipmentCost: string;
  fuelCost: string;
  miscCost: string;
  grossProfit: string;
  grossMarginPercent: string | null;
  isComplete: boolean;
}

export interface CallbackRate {
  completedJobs: number;
  callbackJobs: number;
  callbackRatePercent: number | null;
}

export interface CustomerSatisfaction {
  ratedReviewCount: number;
  averageRating: number | null;
  fiveStarPercent: number | null;
}

function range(start: string, end: string) {
  return `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
}

export const reportsApi = {
  getSnapshot: () => apiFetch<SnapshotKpis>('/reports/snapshot'),
  getPeriodKpis: (start: string, end: string) => apiFetch<PeriodKpis>(`/reports/period-kpis?${range(start, end)}`),
  getRevenueTrend: (start: string, end: string) => apiFetch<TrendPoint[]>(`/reports/revenue-trend?${range(start, end)}`),
  getPaymentTrend: (start: string, end: string) => apiFetch<TrendPoint[]>(`/reports/payment-trend?${range(start, end)}`),
  getRevenueByService: (start: string, end: string) => apiFetch<RevenueByService[]>(`/reports/revenue-by-service?${range(start, end)}`),
  getRevenueByCustomer: (start: string, end: string) => apiFetch<RevenueByCustomer[]>(`/reports/revenue-by-customer?${range(start, end)}`),
  getLeadSourceAnalytics: (start: string, end: string) => apiFetch<LeadSourceAnalytics[]>(`/reports/lead-source-analytics?${range(start, end)}`),
  getLeadSourceTrend: (start: string, end: string) => apiFetch<LeadSourceTrendPoint[]>(`/reports/lead-source-trend?${range(start, end)}`),
  getEstimatePipeline: () => apiFetch<PipelineStage[]>('/reports/estimate-pipeline'),
  getJobCompletionTrend: (start: string, end: string) => apiFetch<TrendPoint[]>(`/reports/job-completion-trend?${range(start, end)}`),
  getCustomerAnalytics: () => apiFetch<CustomerAnalytics>('/reports/customer-analytics'),
  getTechnicianPerformance: (start: string, end: string) => apiFetch<TechnicianPerformance[]>(`/reports/technician-performance?${range(start, end)}`),
  getChemicalUsage: (start: string, end: string) => apiFetch<ChemicalUsage[]>(`/reports/chemical-usage?${range(start, end)}`),
  getEquipmentUsage: (start: string, end: string) => apiFetch<EquipmentUsage[]>(`/reports/equipment-usage?${range(start, end)}`),
  getReceivablesAging: () => apiFetch<ReceivablesAging[]>('/reports/receivables-aging'),
  getMonthlyProfitTrend: (start: string, end: string) => apiFetch<MonthlyProfitPoint[]>(`/reports/monthly-profit?${range(start, end)}`),
  getJobCostSummary: (start: string, end: string) => apiFetch<JobCostSummary | null>(`/reports/job-cost-summary?${range(start, end)}`),
  getJobCostDetail: (start: string, end: string) => apiFetch<JobCostDetailRow[]>(`/reports/job-cost-detail?${range(start, end)}`),
  getCallbackRate: (start: string, end: string) => apiFetch<CallbackRate>(`/reports/callback-rate?${range(start, end)}`),
  getCustomerSatisfaction: (start: string, end: string) => apiFetch<CustomerSatisfaction>(`/reports/customer-satisfaction?${range(start, end)}`),
  getRevenueByTechnician: (start: string, end: string) => apiFetch<RevenueByTechnician[]>(`/reports/revenue-by-technician?${range(start, end)}`),
  getEstimateConversionDetail: (start: string, end: string) => apiFetch<EstimateConversionDetail>(`/reports/estimate-conversion-detail?${range(start, end)}`),
  getEstimateConversionByService: (start: string, end: string) => apiFetch<EstimateConversionByService[]>(`/reports/estimate-conversion-by-service?${range(start, end)}`),
  getAverageTicketDetail: (start: string, end: string) => apiFetch<AverageTicketDetail>(`/reports/average-ticket-detail?${range(start, end)}`),
  getAverageTicketByService: (start: string, end: string) => apiFetch<AverageTicketByService[]>(`/reports/average-ticket-by-service?${range(start, end)}`),
  getServiceProfitability: (start: string, end: string) => apiFetch<ServiceProfitabilityRow[]>(`/reports/service-profitability?${range(start, end)}`),
  getServiceProfitabilityDetail: (start: string, end: string, serviceName: string) =>
    apiFetch<ServiceProfitabilityJobRow[]>(`/reports/service-profitability/detail?${range(start, end)}&serviceName=${encodeURIComponent(serviceName)}`),
};

// ---- Reporting Center Phase 3, Group 2 ----

export interface ServiceProfitabilityRow {
  serviceName: string;
  totalJobs: string;
  jobsWithCostData: string;
  revenue: string;
  actualCost: string;
  grossProfit: string;
  grossMarginPercent: string | null;
  averageTicket: string | null;
}

export interface ServiceProfitabilityJobRow {
  jobId: string;
  jobNumber: string;
  customerName: string;
  completedAt: string;
  serviceName: string;
  revenue: string;
  laborCost: string | null;
  chemicalCost: string | null;
  equipmentCost: string | null;
  fuelCost: string | null;
  miscCost: string | null;
  actualCost: string;
  grossProfit: string | null;
  grossMarginPercent: string | null;
  hasActualCostData: boolean;
}

// ---- Reporting Center Phase 3, Group 1 ----

export interface RevenueByTechnician { technicianId: string; firstName: string; lastName: string; jobsCompleted: string; revenue: string; averageTicket: string }

export interface EstimateConversionDetail {
  total: number;
  accepted: number;
  declined: number;
  pending: number;
  expired: number;
  conversionRatePercent: number | null;
  acceptedValue: number;
  lostValue: number;
  averageAcceptedValue: number;
  averageDaysToAcceptance: number;
}

export interface EstimateConversionByService { serviceName: string; total: string; accepted: string }

export interface AverageTicketDetail {
  completedJobs: number;
  totalRevenue: number;
  averageTicket: number;
  medianTicket: number;
  highestTicket: number;
  lowestTicket: number;
}

export interface AverageTicketByService { serviceName: string; jobsCompleted: string; averageTicket: string; totalRevenue: string }

export const DATE_PRESETS = [
  'Today', 'Yesterday', 'This Week', 'Last Week', 'This Month', 'Last Month',
  'This Quarter', 'Last Quarter', 'This Year', 'Last Year', 'Custom',
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

/**
 * Extended from the original 8-preset list (Last 7/30 Days, no explicit
 * Last Week/Month/Quarter/Year) to the Reporting Center's full requested
 * set. 'Last 7 Days'/'Last 30 Days' were removed rather than kept
 * alongside the new set — two different ways to express "recent," and
 * the brief's own preset list doesn't include them; a report page can
 * still express an arbitrary trailing window via Custom.
 */
export function resolvePreset(preset: DatePreset, customStart?: Date, customEnd?: Date): { start: Date; end: Date } {
  const now = new Date();
  const startOfDay = (d: Date) => { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; };
  const startOfWeek = (d: Date) => { const r = startOfDay(d); const day = r.getDay(); r.setDate(r.getDate() - day); return r; }; // Sunday-start, matches the rest of this app's recurrence/scheduling day-of-week convention (SU/MO/TU...)
  const end = new Date(now);
  switch (preset) {
    case 'Today': return { start: startOfDay(now), end };
    case 'Yesterday': { const y = new Date(now); y.setDate(y.getDate() - 1); return { start: startOfDay(y), end: startOfDay(now) }; }
    case 'This Week': return { start: startOfWeek(now), end };
    case 'Last Week': { const lw = startOfWeek(now); lw.setDate(lw.getDate() - 7); const lwEnd = startOfWeek(now); return { start: lw, end: lwEnd }; }
    case 'This Month': return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
    case 'Last Month': return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 1) };
    case 'This Quarter': { const q = Math.floor(now.getMonth() / 3); return { start: new Date(now.getFullYear(), q * 3, 1), end }; }
    case 'Last Quarter': { const q = Math.floor(now.getMonth() / 3); const lqStart = new Date(now.getFullYear(), (q - 1) * 3, 1); const lqEnd = new Date(now.getFullYear(), q * 3, 1); return { start: lqStart, end: lqEnd }; }
    case 'This Year': return { start: new Date(now.getFullYear(), 0, 1), end };
    case 'Last Year': return { start: new Date(now.getFullYear() - 1, 0, 1), end: new Date(now.getFullYear(), 0, 1) };
    case 'Custom': return { start: customStart ? startOfDay(customStart) : startOfDay(now), end: customEnd ?? end };
  }
}

/**
 * Fixed during the reporting verification gate — the original
 * implementation shifted back by the elapsed *duration* of the current
 * period (end − start), not by one calendar unit. For "This Month" on
 * Aug 19 (Aug 1–19, an 18-day-old partial month), that produced
 * Jul 14–Aug 1 as the comparison window — not Jul 1–19, which is
 * exactly the example the original spec worked through by hand. A
 * duration-based shift is only correct for Custom, where there's no
 * calendar unit to anchor to; every preset needs its own calendar-unit
 * subtraction (1 day/week/month/quarter/year back, same day-of-unit
 * cutoff preserved) to actually produce a "logically equivalent" period.
 */
function subtractMonths(d: Date, months: number): Date {
  // new Date(y, m - n, day) — JS Date normalizes an out-of-range month
  // by rolling the year, e.g. new Date(2026, -1, 1) correctly becomes
  // December 2025. Verified by hand for the Last-Quarter-in-Q1 case
  // (month index -3) during this same verification pass.
  return new Date(d.getFullYear(), d.getMonth() - months, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

export function resolveComparisonPeriod(start: Date, end: Date, preset: DatePreset = 'Custom'): { start: Date; end: Date } {
  switch (preset) {
    case 'Today':
    case 'Yesterday':
      return { start: new Date(start.getTime() - 86400000), end: new Date(end.getTime() - 86400000) };
    case 'This Week':
    case 'Last Week':
      return { start: new Date(start.getTime() - 7 * 86400000), end: new Date(end.getTime() - 7 * 86400000) };
    case 'This Month':
    case 'Last Month':
      return { start: subtractMonths(start, 1), end: subtractMonths(end, 1) };
    case 'This Quarter':
    case 'Last Quarter':
      return { start: subtractMonths(start, 3), end: subtractMonths(end, 3) };
    case 'This Year':
    case 'Last Year':
      return { start: new Date(start.getFullYear() - 1, start.getMonth(), start.getDate()), end: new Date(end.getFullYear() - 1, end.getMonth(), end.getDate()) };
    case 'Custom':
    default: {
      // No calendar unit to anchor a custom range to — a trailing
      // window of the same duration immediately before it is the only
      // defensible default here, and was the ONLY case the original
      // (buggy) implementation happened to be correct for.
      const durationMs = end.getTime() - start.getTime();
      return { start: new Date(start.getTime() - durationMs), end: new Date(start.getTime()) };
    }
  }
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null; // null = "not a meaningful percentage," e.g. $0 -> $500 isn't "infinity% up," it's a new number entirely — a KPI card should show that as "New" rather than a percent.
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

/**
 * CSV export — a real, working export with zero new dependencies (just
 * a Blob download), built for whatever tabular data a report section is
 * currently showing. PDF/Excel export are real, separate future work —
 * not built this pass; stated here rather than silently left out.
 */
export function exportToCsv<T extends object>(filename: string, rows: T[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]) as (keyof T)[];
  const csvLines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')),
  ];
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
