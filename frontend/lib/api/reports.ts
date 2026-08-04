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
  averageTicket: string;
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
};

export const DATE_PRESETS = ['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days', 'This Month', 'This Quarter', 'This Year', 'Custom'] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export function resolvePreset(preset: DatePreset, customStart?: Date, customEnd?: Date): { start: Date; end: Date } {
  const now = new Date();
  const startOfDay = (d: Date) => { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; };
  const end = new Date(now);
  switch (preset) {
    case 'Today': return { start: startOfDay(now), end };
    case 'Yesterday': { const y = new Date(now); y.setDate(y.getDate() - 1); return { start: startOfDay(y), end: startOfDay(now) }; }
    case 'Last 7 Days': { const s = new Date(now); s.setDate(s.getDate() - 7); return { start: startOfDay(s), end }; }
    case 'Last 30 Days': { const s = new Date(now); s.setDate(s.getDate() - 30); return { start: startOfDay(s), end }; }
    case 'This Month': return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
    case 'This Quarter': { const q = Math.floor(now.getMonth() / 3); return { start: new Date(now.getFullYear(), q * 3, 1), end }; }
    case 'This Year': return { start: new Date(now.getFullYear(), 0, 1), end };
    case 'Custom': return { start: customStart ? startOfDay(customStart) : startOfDay(now), end: customEnd ?? end };
  }
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
