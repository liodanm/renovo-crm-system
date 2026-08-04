import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './services/reports.service';
import { QueryReportsDto } from './dto/query-reports.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuthenticatedRequestUser } from '../auth/interfaces/jwt-payload.interface';

@Controller('reports')
@RequirePermissions('estimates.read') // reads across Invoices/Payments/Estimates/Jobs — same baseline-read reasoning as every other cross-module controller in this app
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

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
}
