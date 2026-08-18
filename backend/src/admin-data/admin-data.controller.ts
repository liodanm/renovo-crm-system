import { Controller, Delete, Get, Param } from '@nestjs/common';
import { AdminDataService } from './admin-data.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequestUser } from '../auth/interfaces/jwt-payload.interface';

// Owner-only permanent data deletion, for test-data cleanup. Genuinely
// separate from the existing DELETE /estimates/:id (which stays
// untouched) — that one is narrowly scoped to a staff member deleting
// their own never-sent draft; this is a much broader, Owner-only
// administrative capability that can remove any Estimate/Job/Invoice/
// Payment regardless of status, including its downstream records.
@Controller('admin/data')
@Roles('owner')
export class AdminDataController {
  constructor(private readonly adminData: AdminDataService) {}

  @Get('estimates/:id/preview')
  previewEstimate(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.adminData.previewEstimateDeletion(user.companyId, id);
  }

  @Get('jobs/:id/preview')
  previewJob(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.adminData.previewJobDeletion(user.companyId, id);
  }

  @Get('invoices/:id/preview')
  previewInvoice(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.adminData.previewInvoiceDeletion(user.companyId, id);
  }

  @Delete('estimates/:id')
  deleteEstimate(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.adminData.deleteEstimate(user.companyId, id, user.userId);
  }

  @Delete('jobs/:id')
  deleteJob(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.adminData.deleteJob(user.companyId, id, user.userId);
  }

  @Delete('invoices/:id')
  deleteInvoice(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.adminData.deleteInvoice(user.companyId, id, user.userId);
  }

  @Delete('payments/:id')
  deletePayment(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.adminData.deletePayment(user.companyId, id, user.userId);
  }
}
