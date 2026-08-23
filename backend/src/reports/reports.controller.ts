import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './services/reports.service';
import { QueryReportsDto } from './dto/query-reports.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuthenticatedRequestUser } from '../auth/interfaces/jwt-payload.interface';
import { JobCallbacksService } from '../jobs/services/job-callbacks.service';

@Controller('reports')
@RequirePermissions('estimates.read') // reads across Invoices/Payments/Estimates/Jobs — same baseline-read reasoning as every other cross-module controller in this app
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly callbacks: JobCallbacksService,
  ) {}

  @Get('snapshot')
  getSnapshot(@CurrentUser() user: AuthenticatedRequestUser) {
    // Same real permission check EstimatesController already uses —
    // reused directly, not a second implementation of the same rule.
    const canViewProfitability = user.permissions.includes('estimates.profitability');
    return this.reports.getSnapshotKpis(user.companyId, canViewProfitability);
  }

  @Get('period-kpis')
  getPeriodKpis(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getPeriodKpis(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('revenue-trend')
  getRevenueTrend(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getRevenueTrend(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('payment-trend')
  getPaymentTrend(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getPaymentTrend(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('revenue-by-service')
  getRevenueByService(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getRevenueByService(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('revenue-by-customer')
  getRevenueByCustomer(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getRevenueByCustomer(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('estimate-pipeline')
  getEstimatePipeline(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.reports.getEstimatePipeline(user.companyId);
  }

  @Get('job-completion-trend')
  getJobCompletionTrend(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getJobCompletionTrend(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('customer-analytics')
  getCustomerAnalytics(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.reports.getCustomerAnalytics(user.companyId);
  }

  @Get('technician-performance')
  getTechnicianPerformance(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getTechnicianPerformance(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('chemical-usage')
  getChemicalUsage(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getChemicalUsageSummary(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('equipment-usage')
  getEquipmentUsage(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getEquipmentUsageSummary(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('receivables-aging')
  getReceivablesAging(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.reports.getReceivablesAging(user.companyId);
  }

  @Get('monthly-profit')
  getMonthlyProfitTrend(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    // Same real permission check as the snapshot's profit figure — never
    // exposed to a caller without estimates.profitability, gated here
    // rather than trusting the frontend to simply not render it.
    if (!user.permissions.includes('estimates.profitability')) return [];
    return this.reports.getMonthlyProfitTrend(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('lead-source-analytics')
  getLeadSourceAnalytics(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getLeadSourceAnalytics(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('lead-source-trend')
  getLeadSourceTrend(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getLeadSourceTrend(user.companyId, new Date(query.start), new Date(query.end));
  }

  // ---- Job Cost & Gross Margin (Reporting Center Phase 2) ----
  // Real business cost/profit data — same gate as every other
  // profitability-adjacent figure in this controller, reusing the exact
  // permission Estimates/Jobs already established rather than a third
  // check.

  @Get('job-cost-summary')
  getJobCostSummary(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    if (!user.permissions.includes('jobs.profitability')) return null;
    return this.reports.getJobCostSummary(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('job-cost-detail')
  getJobCostDetail(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    if (!user.permissions.includes('jobs.profitability')) return [];
    return this.reports.getJobCostDetail(user.companyId, new Date(query.start), new Date(query.end));
  }

  // ---- Owner Scorecard supporting endpoints ----

  @Get('callback-rate')
  getCallbackRate(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.callbacks.getCallbackRate(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('customer-satisfaction')
  getCustomerSatisfaction(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getCustomerSatisfactionSummary(user.companyId, new Date(query.start), new Date(query.end));
  }

  // ---- Reporting Center Phase 3, Group 1 ----

  @Get('revenue-by-technician')
  getRevenueByTechnician(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getRevenueByTechnician(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('estimate-conversion-detail')
  getEstimateConversionDetail(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getEstimateConversionDetail(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('estimate-conversion-by-service')
  getEstimateConversionByService(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getEstimateConversionByService(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('average-ticket-detail')
  getAverageTicketDetail(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getAverageTicketDetail(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('average-ticket-by-service')
  getAverageTicketByService(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getAverageTicketByService(user.companyId, new Date(query.start), new Date(query.end));
  }

  // ---- Reporting Center Phase 3, Group 2 ----

  @Get('service-profitability')
  getServiceProfitability(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getServiceProfitability(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('service-profitability/detail')
  getServiceProfitabilityDrilldown(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: QueryReportsDto,
    @Query('serviceName') serviceName: string,
  ) {
    return this.reports.getServiceProfitabilityDrilldown(user.companyId, new Date(query.start), new Date(query.end), serviceName);
  }

  // ---- Reporting Center Phase 3, Group 3 ----

  @Get('customer-ltv')
  getCustomerLtvTable(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.reports.getCustomerLtvTable(user.companyId);
  }

  @Get('customer-ltv/summary')
  getCustomerLtvSummary(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.reports.getCustomerLtvSummary(user.companyId);
  }

  @Get('repeat-customers')
  getRepeatCustomersTable(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.reports.getRepeatCustomersTable(user.companyId);
  }

  @Get('repeat-customers/summary')
  getRepeatCustomersSummary(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.reports.getRepeatCustomersSummary(user.companyId);
  }

  @Get('callbacks')
  getCallbackList(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getCallbackList(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('reviews')
  getReviewList(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getReviewList(user.companyId, new Date(query.start), new Date(query.end));
  }

  // ---- Reporting Center Phase 3, Group 4 ----

  @Get('technician-performance-detail')
  getTechnicianPerformanceDetail(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getTechnicianPerformanceDetail(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('technician-performance-detail/job')
  getTechnicianPerformanceDrilldown(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: QueryReportsDto,
    @Query('technicianId') technicianId: string,
  ) {
    return this.reports.getTechnicianPerformanceDrilldown(user.companyId, new Date(query.start), new Date(query.end), technicianId);
  }

  @Get('route-efficiency')
  getRouteEfficiencySummary(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getRouteEfficiencySummary(user.companyId, new Date(query.start), new Date(query.end));
  }

  @Get('route-efficiency/by-day')
  getRouteEfficiencyByDay(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryReportsDto) {
    return this.reports.getRouteEfficiencyByDay(user.companyId, new Date(query.start), new Date(query.end));
  }
}
