import { reportsApi, resolvePreset } from './api/reports';

export type WidgetValue = { display: string; sub?: string; tone?: 'good' | 'warning' } | null;

export interface DashboardWidget {
  id: string;
  label: string;
  description: string;
  category: 'Sales' | 'Profitability' | 'Customers' | 'Operations';
  /** The full report this widget summarizes — clicking the widget goes here. */
  reportHref: string;
  /** Every fetcher below calls an already-existing reportsApi method —
   * this file adds zero new business calculations. Uses "This Month" as
   * the widget's period, matching the Owner Scorecard's own default. */
  fetchValue: () => Promise<WidgetValue>;
}

const money = (n: number | string | null | undefined) =>
  n == null ? null : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

function thisMonth() {
  const { start, end } = resolvePreset('This Month');
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  {
    id: 'collected-revenue',
    label: 'Collected Revenue',
    description: 'Successful payments this month',
    category: 'Sales',
    reportHref: '/reports/revenue',
    fetchValue: async () => {
      const { startIso, endIso } = thisMonth();
      const trend = await reportsApi.getPaymentTrend(startIso, endIso);
      const total = trend.reduce((sum, p) => sum + Number((p as any).amount ?? 0), 0);
      return { display: money(total) ?? '—' };
    },
  },
  {
    id: 'invoiced-revenue',
    label: 'Invoiced Revenue',
    description: 'Invoice totals issued this month',
    category: 'Sales',
    reportHref: '/reports/revenue',
    fetchValue: async () => {
      const { startIso, endIso } = thisMonth();
      const trend = await reportsApi.getRevenueTrend(startIso, endIso);
      const total = trend.reduce((sum, p) => sum + Number((p as any).revenue ?? 0), 0);
      return { display: money(total) ?? '—' };
    },
  },
  {
    id: 'completed-jobs',
    label: 'Completed Jobs',
    description: 'Jobs completed this month',
    category: 'Sales',
    reportHref: '/reports/revenue',
    fetchValue: async () => {
      const { startIso, endIso } = thisMonth();
      const kpis = await reportsApi.getPeriodKpis(startIso, endIso);
      return { display: kpis.jobsCompleted };
    },
  },
  {
    id: 'average-ticket',
    label: 'Average Ticket',
    description: 'Completed-job revenue ÷ completed jobs',
    category: 'Sales',
    reportHref: '/reports/average-ticket',
    fetchValue: async () => {
      const { startIso, endIso } = thisMonth();
      const kpis = await reportsApi.getPeriodKpis(startIso, endIso);
      return { display: money(kpis.averageTicket) ?? '—' };
    },
  },
  {
    id: 'estimate-conversion',
    label: 'Estimate Conversion',
    description: 'Win rate on estimates sent this month',
    category: 'Sales',
    reportHref: '/reports/estimate-conversion',
    fetchValue: async () => {
      const { startIso, endIso } = thisMonth();
      const detail = await reportsApi.getEstimateConversionDetail(startIso, endIso);
      return { display: detail.conversionRatePercent != null ? `${detail.conversionRatePercent}%` : '—' };
    },
  },
  {
    id: 'gross-profit',
    label: 'Gross Profit',
    description: 'Actual revenue − actual cost, this month',
    category: 'Profitability',
    reportHref: '/reports/job-cost',
    fetchValue: async () => {
      const { startIso, endIso } = thisMonth();
      const summary = await reportsApi.getJobCostSummary(startIso, endIso);
      if (!summary || summary.totalGrossProfit == null) return { display: 'Not Yet Available' };
      return { display: money(summary.totalGrossProfit) ?? '—', sub: `${summary.jobsWithCostData} of ${summary.completedJobs} jobs` };
    },
  },
  {
    id: 'gross-margin',
    label: 'Gross Margin',
    description: 'Total gross profit ÷ total revenue — never an average of job margins',
    category: 'Profitability',
    reportHref: '/reports/job-cost',
    fetchValue: async () => {
      const { startIso, endIso } = thisMonth();
      const summary = await reportsApi.getJobCostSummary(startIso, endIso);
      if (!summary || summary.grossMarginPercent == null) return { display: 'Not Yet Available' };
      return { display: `${summary.grossMarginPercent}%` };
    },
  },
  {
    id: 'service-profitability',
    label: 'Service Profitability',
    description: 'Which services generate the most gross profit',
    category: 'Profitability',
    reportHref: '/reports/service-profitability',
    fetchValue: async () => {
      const { startIso, endIso } = thisMonth();
      const rows = await reportsApi.getServiceProfitability(startIso, endIso);
      const top = [...rows].sort((a, b) => Number(b.grossProfit) - Number(a.grossProfit))[0];
      return top ? { display: top.serviceName, sub: `${money(top.grossProfit)} gross profit` } : { display: 'No data yet' };
    },
  },
  {
    id: 'customer-ltv',
    label: 'Customer Lifetime Value',
    description: 'Average lifetime collected revenue per customer',
    category: 'Customers',
    reportHref: '/reports/customer-lifetime-value',
    fetchValue: async () => {
      const summary = await reportsApi.getCustomerLtvSummary();
      return { display: money(summary.averageLtv) ?? '—' };
    },
  },
  {
    id: 'repeat-customer-rate',
    label: 'Repeat Customer Rate',
    description: 'Customers with more than one completed job',
    category: 'Customers',
    reportHref: '/reports/repeat-customers',
    fetchValue: async () => {
      const summary = await reportsApi.getRepeatCustomersSummary();
      return { display: summary.repeatCustomerRatePercent != null ? `${summary.repeatCustomerRatePercent}%` : '—' };
    },
  },
  {
    id: 'customer-satisfaction',
    label: 'Customer Satisfaction',
    description: 'Average rating this month',
    category: 'Customers',
    reportHref: '/reports/satisfaction',
    fetchValue: async () => {
      const { startIso, endIso } = thisMonth();
      const sat = await reportsApi.getCustomerSatisfaction(startIso, endIso);
      return { display: sat.averageRating != null ? `${sat.averageRating} ★` : 'Not Rated' };
    },
  },
  {
    id: 'callback-rate',
    label: 'Callback Rate',
    description: 'Callback jobs ÷ eligible completed jobs, this month',
    category: 'Customers',
    reportHref: '/reports/satisfaction',
    fetchValue: async () => {
      const { startIso, endIso } = thisMonth();
      const rate = await reportsApi.getCallbackRate(startIso, endIso);
      return {
        display: rate.callbackRatePercent != null ? `${rate.callbackRatePercent}%` : '—',
        tone: rate.callbackRatePercent != null && rate.callbackRatePercent > 5 ? 'warning' : 'good',
      };
    },
  },
  {
    id: 'technician-performance',
    label: 'Technician Performance',
    description: 'Top technician by gross profit this month',
    category: 'Operations',
    reportHref: '/reports/technician-performance',
    fetchValue: async () => {
      const { startIso, endIso } = thisMonth();
      const rows = await reportsApi.getTechnicianPerformanceDetail(startIso, endIso);
      const top = [...rows].sort((a, b) => Number(b.grossProfit) - Number(a.grossProfit))[0];
      return top ? { display: `${top.firstName} ${top.lastName}`, sub: `${money(top.grossProfit)} gross profit` } : { display: 'No data yet' };
    },
  },
  {
    id: 'route-efficiency',
    label: 'Route & Job Efficiency',
    description: 'Average schedule variance this month',
    category: 'Operations',
    reportHref: '/reports/route-efficiency',
    fetchValue: async () => {
      const { startIso, endIso } = thisMonth();
      const summary = await reportsApi.getRouteEfficiencySummary(startIso, endIso);
      if (summary.averageScheduleVarianceMinutes == null) return { display: 'Not Yet Available' };
      const v = summary.averageScheduleVarianceMinutes;
      return { display: `${v >= 0 ? '+' : ''}${v} min`, tone: v > 0 ? 'warning' : 'good' };
    },
  },
];

// Owner-facing financial + operational snapshot — not "every report,"
// per the explicit "don't show everything by default" instruction.
export const DEFAULT_WIDGET_IDS = [
  'collected-revenue',
  'completed-jobs',
  'average-ticket',
  'estimate-conversion',
  'gross-profit',
  'gross-margin',
  'callback-rate',
];

export const WIDGET_CATEGORIES: DashboardWidget['category'][] = ['Sales', 'Profitability', 'Customers', 'Operations'];
