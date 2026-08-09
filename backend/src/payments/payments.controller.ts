import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PaymentsService } from './services/payments.service';
import { RecordPaymentDto, RefundPaymentDto, VoidPaymentDto } from './dto/payment.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuthenticatedRequestUser } from '../auth/interfaces/jwt-payload.interface';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('payments')
  @RequirePermissions('invoices.read')
  findAll(@CurrentUser() user: AuthenticatedRequestUser, @Query('status') status?: string) {
    return this.payments.findAll(user.companyId, status);
  }

  @Get('invoices/:invoiceId/payments')
  @RequirePermissions('invoices.read')
  listByInvoice(@CurrentUser() user: AuthenticatedRequestUser, @Param('invoiceId') invoiceId: string) {
    return this.payments.listByInvoice(user.companyId, invoiceId);
  }

  @Post('invoices/:invoiceId/payments')
  @RequirePermissions('payments.write')
  recordPayment(@CurrentUser() user: AuthenticatedRequestUser, @Param('invoiceId') invoiceId: string, @Body() dto: RecordPaymentDto) {
    return this.payments.recordPayment(user.companyId, invoiceId, user.userId, dto);
  }

  @Post('customers/:customerId/payments')
  @RequirePermissions('payments.write')
  recordStandalonePayment(@CurrentUser() user: AuthenticatedRequestUser, @Param('customerId') customerId: string, @Body() dto: RecordPaymentDto) {
    return this.payments.recordStandalonePayment(user.companyId, customerId, user.userId, dto);
  }

  @Get('payments/:id')
  @RequirePermissions('invoices.read')
  findOne(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.payments.findOne(user.companyId, id);
  }

  @Post('payments/:id/void')
  @RequirePermissions('payments.write')
  voidPayment(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: VoidPaymentDto) {
    return this.payments.voidPayment(user.companyId, id, user.userId, dto);
  }

  @Post('payments/:id/refund')
  @RequirePermissions('payments.write')
  refundPayment(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: RefundPaymentDto) {
    return this.payments.refundPayment(user.companyId, id, user.userId, dto);
  }

  @Get('payments/:id/receipt')
  @RequirePermissions('invoices.read')
  getReceipt(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.payments.getReceipt(user.companyId, id);
  }
}
