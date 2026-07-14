import { BadRequestException, Body, Controller, Get, Headers, Param, Post, RawBodyRequest, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { PortalAuthService } from './services/portal-auth.service';
import { PortalDataService } from './services/portal-data.service';
import { StripePaymentService } from './services/stripe-payment.service';
import { PortalChatService } from './services/portal-chat.service';
import { PortalCustomerGuard } from './guards/portal-customer.guard';
import { CurrentPortalCustomer } from './decorators/current-portal-customer.decorator';
import { AuthenticatedPortalCustomer } from './interfaces/portal-token.interface';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../common/prisma/prisma.service';
import { RequestMagicLinkDto, VerifyMagicLinkDto } from './dto/portal-auth.dto';
import { ApproveEstimateDto } from './dto/approve-estimate.dto';
import { CreateServiceRequestDto } from './dto/service-request.dto';
import { PortalChatDto } from './dto/portal-chat.dto';

@Controller('portal')
export class PortalController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auth: PortalAuthService,
    private readonly data: PortalDataService,
    private readonly stripe: StripePaymentService,
    private readonly chat: PortalChatService,
  ) {}

  // ===========================================================================
  // Auth — public, no guard (this IS the login flow)
  // ===========================================================================

  @Throttle({ default: { limit: 3, ttl: 60_000 } }) // same email-bombing concern as staff forgot-password
  @Post(':companySlug/auth/request-link')
  requestLink(@Param('companySlug') companySlug: string, @Body() dto: RequestMagicLinkDto) {
    return this.auth.requestMagicLink(companySlug, dto.email);
  }

  @Post('auth/verify')
  verify(@Body() dto: VerifyMagicLinkDto) {
    return this.auth.verifyMagicLink(dto.token);
  }

  // ===========================================================================
  // Everything below requires a valid portal session, scoped to exactly one
  // customer — see PortalCustomerGuard and PortalDataService for how that's
  // enforced at both the auth and query layers.
  // ===========================================================================

  /**
   * The gap flagged in the last two audits, closed: verifyWebhookSignature
   * has been implemented and tested since the Portal was first built —
   * this route is what was actually missing. Without it, a customer's
   * card payment succeeds in Stripe and the CRM never finds out, so the
   * invoice sits "unpaid" until a human notices and manually reconciles it.
   *
   * `@Public()` is required — there's a global JwtAuthGuard on every route
   * in this app, and Stripe is not a logged-in user. Signature verification
   * (not JWT auth) is what proves this request actually came from Stripe.
   */
  @Public()
  @Post('webhooks/stripe')
  async handleStripeWebhook(@Req() req: RawBodyRequest<Request>, @Res() res: Response, @Headers('stripe-signature') signature?: string) {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret || !signature || !req.rawBody) {
      throw new BadRequestException('Webhook not configured or missing signature');
    }

    const isValid = this.stripe.verifyWebhookSignature(req.rawBody.toString('utf8'), signature, webhookSecret);
    if (!isValid) throw new BadRequestException('Invalid Stripe signature');

    const event = JSON.parse(req.rawBody.toString('utf8'));

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const invoiceId = paymentIntent.metadata?.invoiceId;
      if (invoiceId) {
        await this.reconcilePayment(invoiceId, paymentIntent);
      }
    }

    // Stripe expects a fast 200 regardless of whether we found a matching
    // invoice — an unrecognized/already-processed event isn't an error on
    // Stripe's side, and a non-200 here makes Stripe retry indefinitely.
    return res.status(200).send({ received: true });
  }

  private async reconcilePayment(invoiceId: string, paymentIntent: any) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) return;

    // Idempotency: Stripe can and does deliver the same webhook event more
    // than once (their own docs guarantee at-least-once, not exactly-once
    // delivery). Without this check, a duplicate delivery would double-count
    // the payment and could push amountPaid above the real invoice total.
    const alreadyRecorded = await this.prisma.payment.findFirst({ where: { stripePaymentIntentId: paymentIntent.id } });
    if (alreadyRecorded) return;

    const amount = paymentIntent.amount_received / 100; // Stripe amounts are in cents
    const newAmountPaid = invoice.amountPaid.toNumber() + amount;
    const isPaidInFull = newAmountPaid >= invoice.totalAmount.toNumber();

    await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          companyId: invoice.companyId,
          invoiceId: invoice.id,
          customerId: invoice.customerId,
          amount,
          method: 'card',
          status: 'succeeded',
          stripePaymentIntentId: paymentIntent.id,
          processedAt: new Date(),
        },
      }),
      this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: { increment: amount },
          status: isPaidInFull ? 'paid' : 'partial',
          paidAt: isPaidInFull ? new Date() : undefined,
        },
      }),
    ]);
  }

  @UseGuards(PortalCustomerGuard)
  @Get('me')
  me(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer) {
    return customer;
  }

  @UseGuards(PortalCustomerGuard)
  @Get('estimates')
  getEstimates(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer) {
    return this.data.getEstimates(customer.companyId, customer.customerId);
  }

  @UseGuards(PortalCustomerGuard)
  @Post('estimates/:id/approve')
  approveEstimate(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer, @Param('id') id: string, @Body() dto: ApproveEstimateDto) {
    return this.data.approveEstimate(customer.companyId, customer.customerId, id, dto.signatureDataUrl);
  }

  @UseGuards(PortalCustomerGuard)
  @Post('estimates/:id/decline')
  declineEstimate(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer, @Param('id') id: string) {
    return this.data.declineEstimate(customer.companyId, customer.customerId, id);
  }

  @UseGuards(PortalCustomerGuard)
  @Get('invoices')
  getInvoices(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer) {
    return this.data.getInvoices(customer.companyId, customer.customerId);
  }

  /**
   * Server-rendered, print-optimized invoice HTML — the customer's browser
   * "Save as PDF" from here, same real approach the staff invoice view
   * uses. A dedicated PDF-generation library is the natural upgrade if a
   * literal application/pdf response ever becomes a hard requirement; this
   * is the same pragmatic choice made for the staff-facing invoice view.
   */
  @UseGuards(PortalCustomerGuard)
  @Get('invoices/:id/view')
  async viewInvoice(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer, @Param('id') id: string, @Res() res: Response) {
    const invoice = await this.data.getOwnedInvoice(customer.companyId, customer.customerId, id);
    res.set('Content-Type', 'text/html');
    res.send(this.renderInvoiceHtml(invoice));
  }

  @UseGuards(PortalCustomerGuard)
  @Post('invoices/:id/pay-intent')
  async createPaymentIntent(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer, @Param('id') id: string) {
    const invoice = await this.data.getOwnedInvoice(customer.companyId, customer.customerId, id);
    const balance = invoice.totalAmount.toNumber() - invoice.amountPaid.toNumber();
    const result = await this.stripe.createPaymentIntent({
      amountCents: Math.round(balance * 100),
      currency: 'usd',
      invoiceId: invoice.id,
      customerEmail: customer.email,
    });
    if (!result) return { available: false, message: 'Online payment is not available right now — please contact us.' };
    return { available: true, ...result };
  }

  @UseGuards(PortalCustomerGuard)
  @Get('service-history')
  getServiceHistory(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer) {
    return this.data.getServiceHistory(customer.companyId, customer.customerId);
  }

  @UseGuards(PortalCustomerGuard)
  @Get('properties')
  getProperties(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer) {
    return this.data.getProperties(customer.companyId, customer.customerId);
  }

  @UseGuards(PortalCustomerGuard)
  @Post('photos/upload-url')
  presignPhoto(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer, @Body() body: { propertyId: string; fileName: string; mimeType: string }) {
    return this.data.presignPhotoUpload(customer.companyId, customer.customerId, body.propertyId, body.fileName, body.mimeType);
  }

  @UseGuards(PortalCustomerGuard)
  @Post('photos')
  confirmPhoto(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer, @Body() body: { propertyId: string; key: string; mimeType?: string }) {
    return this.data.confirmPhotoUpload(customer.companyId, customer.customerId, body.propertyId, body.key, body.mimeType);
  }

  @UseGuards(PortalCustomerGuard)
  @Post('service-requests')
  createServiceRequest(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer, @Body() dto: CreateServiceRequestDto) {
    return this.data.createServiceRequest(customer.companyId, customer.customerId, dto);
  }

  @UseGuards(PortalCustomerGuard)
  @Get('service-requests')
  getServiceRequests(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer) {
    return this.data.getServiceRequests(customer.companyId, customer.customerId);
  }

  @UseGuards(PortalCustomerGuard)
  @Post('chat')
  async postChat(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer, @Body() dto: PortalChatDto) {
    return this.chat.chat(customer.companyId, customer.customerId, dto.message, dto.history ?? []);
  }

  private renderInvoiceHtml(invoice: any): string {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice</title>
      <style>body{font-family:sans-serif;padding:40px;color:#0f172a} .total{font-size:1.5rem;font-weight:600}</style>
      </head><body>
      <h1>Invoice ${invoice.invoiceNumber}</h1>
      <p>Total: $${invoice.totalAmount.toNumber().toFixed(2)} — Paid: $${invoice.amountPaid.toNumber().toFixed(2)}</p>
      <p class="total">Balance due: $${(invoice.totalAmount.toNumber() - invoice.amountPaid.toNumber()).toFixed(2)}</p>
      <script>window.print()</script>
      </body></html>`;
  }
}
