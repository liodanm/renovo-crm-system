import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { InvoicesService } from './services/invoices.service';
import { UpdateInvoiceDto, QueryInvoicesDto } from './dto/invoice.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuthenticatedRequestUser } from '../auth/interfaces/jwt-payload.interface';

@Controller('invoices')
@RequirePermissions('invoices.read')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryInvoicesDto) {
    return this.invoices.findAll(user.companyId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.invoices.findOne(user.companyId, id);
  }

  @Post('from-job/:jobId')
  @RequirePermissions('invoices.write')
  generateFromJob(@CurrentUser() user: AuthenticatedRequestUser, @Param('jobId') jobId: string) {
    return this.invoices.generateFromJob(user.companyId, jobId, user.userId);
  }

  @Patch(':id')
  @RequirePermissions('invoices.write')
  update(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.invoices.update(user.companyId, id, dto);
  }

  @Post(':id/send')
  @RequirePermissions('invoices.write')
  send(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.invoices.send(user.companyId, id);
  }

  @Post(':id/void')
  @RequirePermissions('invoices.write')
  void_(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.invoices.void(user.companyId, id);
  }
}
