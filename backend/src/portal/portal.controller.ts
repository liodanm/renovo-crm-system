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
import { PdfService } from '../documents/services/pdf.service';
import { CompanyContextService } from '../documents/services/company-context.service';
import { generateEstimateFilename, generateInvoiceFilename } from '../common/utils/pdf-filename.util';
import { logAutomationEvent } from '../common/utils/automation-event.util';

@Controller('portal')
export class PortalController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auth: PortalAuthService,
    private readonly data: PortalDataService,
    private readonly stripe: StripePaymentService,
    private readonly chat: PortalChatService,
    private readonly pdf: PdfService,
    private readonly companyContext: CompanyContextService,
  ) {}

  // ===========================================================================
  // Auth — public, no guard (this IS the login flow)
  // ===========================================================================

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } }) // same email-bombing concern as staff forgot-password
  @Post(':companySlug/auth/request-link')
  requestLink(@Param('companySlug') companySlug: string, @Body() dto: RequestMagicLinkDto) {
    return this.auth.requestMagicLink(companySlug, dto.email);
  }

  @Public()
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
    } else if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object;
      const invoiceId = paymentIntent.metadata?.invoiceId;
      if (invoiceId) {
        await this.recordFailedPayment(invoiceId, paymentIntent);
      }
    }

    // Stripe expects a fast 200 regardless of whether we found a matching
    // invoice — an unrecognized/already-processed event isn't an error on
    // Stripe's side, and a non-200 here makes Stripe retry indefinitely.
    return res.status(200).send({ received: true });
  }

  private async reconcilePayment(invoiceId: string, paymentIntent: any) {
    // Explicit companyId scoping (not RLS) is deliberate here, matching
    // this codebase's own established pattern for @Public() routes with
    // no authenticated request to derive a tenant from (see the Quote
    // Widget module's documented rule). companyId comes from the
    // PaymentIntent's own metadata, set server-side when the intent was
    // created — not client-editable, so this is a real scope, not a
    // client-asserted one. A PaymentIntent created before this metadata
    // field existed would have no companyId; skip rather than query
    // across every tenant.
    const companyId = paymentIntent.metadata?.companyId;
    if (!companyId) return;

    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, companyId } });
    if (!invoice) return;

    // Idempotency: Stripe can and does deliver the same webhook event more
    // than once (their own docs guarantee at-least-once, not exactly-once
    // delivery). Without this check, a duplicate delivery would double-count
    // the payment and could push amountPaid above the real invoice total.
    // Scoped by status as well as paymentIntentId: a single PaymentIntent
    // can have a failed attempt followed by a later successful retry under
    // the same ID, so this must not treat an already-recorded *failure* as
    // if the *success* had already been recorded too.
    const alreadyRecorded = await this.prisma.payment.findFirst({ where: { stripePaymentIntentId: paymentIntent.id, status: 'succeeded' } });
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
      // Same transaction, same amount already being applied to the
      // invoice above — not a second calculation, just propagated to
      // the customer record too. Protected by the alreadyRecorded
      // idempotency check above this whole block runs, same as the
      // payment/invoice writes it sits alongside.
      this.prisma.customer.update({
        where: { id: invoice.customerId },
        data: { lifetimeValue: { increment: amount } },
      }),
    ]);

    if (isPaidInFull) {
      await logAutomationEvent(this.prisma, {
        companyId: invoice.companyId,
        customerId: invoice.customerId,
        ruleType: 'invoice_paid',
        dedupeKey: `invoice-paid-${invoice.id}`,
        messageBody: `Invoice ${invoice.invoiceNumber} paid in full via Stripe`,
      });
    }
  }

  /**
   * The A2 fix: a failed card payment previously left no trace anywhere in
   * the system — the CRM simply never found out. This records the failed
   * attempt using the exact same `payments` table and `payment_status_history`
   * pattern every other payment write in this app already uses (status
   * 'failed' was already a valid value in payments' own CHECK constraint,
   * confirmed before writing this — no schema change needed for the table
   * itself). Deliberately never touches invoices.amount_paid or
   * invoices.status: $0 was actually collected, so nothing about the
   * invoice's paid state has changed. Invoice void logic is untouched by
   * this method entirely.
   */
  private async recordFailedPayment(invoiceId: string, paymentIntent: any) {
    const companyId = paymentIntent.metadata?.companyId;
    if (!companyId) return;

    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, companyId } });
    if (!invoice) return;

    // Same at-least-once-delivery idempotency reasoning as reconcilePayment,
    // scoped by status for the same reason: a failed record must not block
    // a later success on the same PaymentIntent ID from ever being recorded.
    const alreadyRecorded = await this.prisma.payment.findFirst({ where: { stripePaymentIntentId: paymentIntent.id, status: 'failed' } });
    if (alreadyRecorded) return;

    // amount (not amount_received) — a failed attempt received $0; this is
    // the amount that was attempted, for staff visibility into what the
    // customer was trying to pay.
    const amount = paymentIntent.amount / 100;
    const failureReason: string | undefined = paymentIntent.last_payment_error?.message;

    const payment = await this.prisma.payment.create({
      data: {
        companyId: invoice.companyId,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        amount,
        method: 'card',
        status: 'failed',
        stripePaymentIntentId: paymentIntent.id,
        notes: failureReason ?? null,
      },
    });

    await this.prisma.withTenantContext(invoice.companyId, (tx) => tx.$executeRaw`
      INSERT INTO payment_status_history (company_id, payment_id, from_status, to_status, changed_by_user_id, note)
      VALUES (${invoice.companyId}::uuid, ${payment.id}::uuid, NULL, 'failed', NULL, ${failureReason ?? 'Stripe payment attempt failed'})
    `);

    await logAutomationEvent(this.prisma, {
      companyId: invoice.companyId,
      customerId: invoice.customerId,
      ruleType: 'payment_failed',
      dedupeKey: `payment-failed-${paymentIntent.id}`,
      messageBody: `Payment attempt of $${amount.toFixed(2)} failed for Invoice ${invoice.invoiceNumber}${failureReason ? ` (${failureReason})` : ''}`,
    });
  }

  @Public()
  @UseGuards(PortalCustomerGuard)
  @Get('me')
  me(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer) {
    return customer;
  }

  @Public()
  @UseGuards(PortalCustomerGuard)
  @Get('dashboard')
  getDashboard(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer) {
    return this.data.getDashboard(customer.companyId, customer.customerId);
  }

  @Public()
  @UseGuards(PortalCustomerGuard)
  @Get('estimates')
  getEstimates(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer) {
    return this.data.getEstimates(customer.companyId, customer.customerId);
  }

  /**
   * The one new route this phase adds. Reuses getEstimateForPdf()
   * unchanged — same Prisma query, same { id, companyId, customerId }
   * ownership filter, same NotFoundException on any mismatch (never
   * reveals whether a record exists for someone else). The shaping
   * below mirrors exactly what viewEstimate() already does when it
   * hands data to the PDF generator — customer.name/email/phone,
   * property's address fields only — because that's the established
   * "what's safe to show a customer" boundary in this file, not a new
   * one invented for this route.
   */
  @Public()
  @UseGuards(PortalCustomerGuard)
  @Get('estimates/:id')
  async getEstimateDetail(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer, @Param('id') id: string) {
    const estimate = await this.data.getEstimateForPdf(customer.companyId, customer.customerId, id);
    return {
      id: estimate.id,
      estimateNumber: estimate.estimateNumber,
      status: estimate.status,
      createdAt: estimate.createdAt,
      validUntil: estimate.validUntil,
      notes: estimate.notes,
      terms: estimate.terms,
      subtotal: estimate.subtotal,
      discountAmount: estimate.discountAmount,
      taxRate: estimate.taxRate,
      taxAmount: estimate.taxAmount,
      totalAmount: estimate.totalAmount,
      lineItems: estimate.lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitOfMeasure: li.unitOfMeasure,
        unitPrice: li.unitPrice,
        total: li.total,
      })),
      customer: {
        name: estimate.customer.businessName ?? `${estimate.customer.firstName ?? ''} ${estimate.customer.lastName ?? ''}`.trim(),
      },
      property: {
        addressLine1: estimate.property.addressLine1,
        city: estimate.property.city,
        state: estimate.property.state,
      },
    };
  }

  @Public()
  @UseGuards(PortalCustomerGuard)
  @Post('estimates/:id/approve')
  approveEstimate(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer, @Param('id') id: string, @Body() dto: ApproveEstimateDto) {
    return this.data.approveEstimate(customer.companyId, customer.customerId, id, dto.signatureDataUrl);
  }

  @Public()
  @UseGuards(PortalCustomerGuard)
  @Post('estimates/:id/decline')
  declineEstimate(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer, @Param('id') id: string) {
    return this.data.declineEstimate(customer.companyId, customer.customerId, id);
  }

  @Public()
  @UseGuards(PortalCustomerGuard)
  @Get('invoices')
  getInvoices(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer) {
    return this.data.getInvoices(customer.companyId, customer.customerId);
  }

  /**
   * The one real gap the audit for this feature found: estimates could
   * be listed and approved/declined from the portal, but there was no
   * way for a customer to actually open one as a document — no
   * equivalent of the invoice view route below existed at all. Real PDF,
   * same PdfService every staff-facing view uses, and this is what
   * actually stamps viewedAt — "Estimate Viewed" automation depends on
   * a customer having genuinely opened it, not just received the email.
   */
  @Public()
  @UseGuards(PortalCustomerGuard)
  @Get('estimates/:id/view')
  async viewEstimate(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer, @Param('id') id: string, @Res() res: Response) {
    const estimate = await this.data.getEstimateForPdf(customer.companyId, customer.customerId, id);
    await this.data.markEstimateViewed(customer.companyId, customer.customerId, id);
    const { company, branding } = await this.companyContext.getCompanyAndBranding(customer.companyId);

    const buffer = await this.pdf.generateEstimatePdf({
      estimateNumber: estimate.estimateNumber,
      status: estimate.status,
      issueDate: estimate.createdAt,
      validUntil: estimate.validUntil,
      lineItems: estimate.lineItems.map((li) => ({
        description: li.description,
        serviceType: (li as any).serviceType,
        quantity: Number(li.quantity),
        unitOfMeasure: li.unitOfMeasure,
        unitPrice: Number(li.unitPrice),
        total: Number(li.total),
      })),
      subtotal: Number(estimate.subtotal),
      discountAmount: Number(estimate.discountAmount),
      taxRatePercent: Number(estimate.taxRate) * 100,
      taxAmount: Number(estimate.taxAmount),
      totalAmount: Number(estimate.totalAmount),
      notes: estimate.notes,
      terms: estimate.terms,
      company,
      branding,
      customer: {
        name: estimate.customer.businessName ?? `${estimate.customer.firstName ?? ''} ${estimate.customer.lastName ?? ''}`.trim(),
        email: estimate.customer.email,
        phone: estimate.customer.phone,
      },
      property: { addressLine1: estimate.property.addressLine1, city: estimate.property.city, state: estimate.property.state },
    });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${generateEstimateFilename(estimate.estimateNumber)}"` });
    res.send(buffer);
  }

  /**
   * Real PDF now, replacing the bare unbranded HTML placeholder this
   * used to return (no logo, no company info, no line items — just a
   * total and a browser print dialog). Same PdfService/branding path as
   * every staff-facing document, and this now stamps viewedAt too — the
   * old version never recorded that a customer had actually opened it.
   */
  @Public()
  @UseGuards(PortalCustomerGuard)
  @Get('invoices/:id/view')
  async viewInvoice(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer, @Param('id') id: string, @Res() res: Response) {
    const invoice = await this.data.getInvoiceForPdf(customer.companyId, customer.customerId, id);
    await this.data.markInvoiceViewed(customer.companyId, customer.customerId, id);
    const { company, branding } = await this.companyContext.getCompanyAndBranding(customer.companyId);
    const portalUrl = `${this.config.get('auth.frontendUrl') ?? ''}/portal`;
    const balanceDue = invoice.totalAmount.toNumber() - invoice.amountPaid.toNumber();
    const property = invoice.property ?? invoice.job?.property ?? null;

    const buffer = await this.pdf.generateInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issueDate: invoice.createdAt,
      dueDate: invoice.dueDate,
      lineItems: invoice.lineItems.map((li: any) => ({
        description: li.description,
        serviceType: li.serviceType,
        quantity: Number(li.quantity),
        unitOfMeasure: li.unitOfMeasure,
        unitPrice: Number(li.unitPrice),
        total: Number(li.total),
      })),
      subtotal: invoice.subtotal.toNumber(),
      discountAmount: invoice.discountAmount.toNumber(),
      discountSource: (invoice as any).discountSource ?? null,
      taxRatePercent: invoice.taxRate.toNumber() * 100,
      taxAmount: invoice.taxAmount.toNumber(),
      totalAmount: invoice.totalAmount.toNumber(),
      amountPaid: invoice.amountPaid.toNumber(),
      balanceDue,
      notes: invoice.notes,
      terms: invoice.terms,
      paymentLinkUrl: balanceDue > 0 ? portalUrl : null,
      company,
      branding,
      customer: {
        name: invoice.customer.businessName ?? `${invoice.customer.firstName ?? ''} ${invoice.customer.lastName ?? ''}`.trim(),
        email: invoice.customer.email,
        phone: invoice.customer.phone,
      },
      property: { addressLine1: property?.addressLine1 ?? null, city: property?.city ?? null, state: property?.state ?? null },
    });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${generateInvoiceFilename(invoice.invoiceNumber, invoice.estimate?.estimateNumber ?? null)}"` });
    res.send(buffer);
  }

  @Public()
  @UseGuards(PortalCustomerGuard)
  @Post('invoices/:id/pay-intent')
  async createPaymentIntent(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer, @Param('id') id: string) {
    const invoice = await this.data.getOwnedInvoice(customer.companyId, customer.customerId, id);
    const balance = invoice.totalAmount.toNumber() - invoice.amountPaid.toNumber();
    const result = await this.stripe.createPaymentIntent({
      amountCents: Math.round(balance * 100),
      currency: 'usd',
      invoiceId: invoice.id,
      companyId: customer.companyId,
      customerEmail: customer.email,
    });
    if (!result) return { available: false, message: 'Online payment is not available right now — please contact us.' };
    return { available: true, ...result };
  }

  @Public()
  @UseGuards(PortalCustomerGuard)
  @Get('service-history')
  getServiceHistory(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer) {
    return this.data.getServiceHistory(customer.companyId, customer.customerId);
  }

  @Public()
  @UseGuards(PortalCustomerGuard)
  @Get('properties')
  getProperties(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer) {
    return this.data.getProperties(customer.companyId, customer.customerId);
  }

  @Public()
  @UseGuards(PortalCustomerGuard)
  @Post('photos/upload-url')
  presignPhoto(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer, @Body() body: { propertyId: string; fileName: string; mimeType: string }) {
    return this.data.presignPhotoUpload(customer.companyId, customer.customerId, body.propertyId, body.fileName, body.mimeType);
  }

  @Public()
  @UseGuards(PortalCustomerGuard)
  @Post('photos')
  confirmPhoto(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer, @Body() body: { propertyId: string; key: string; mimeType?: string }) {
    return this.data.confirmPhotoUpload(customer.companyId, customer.customerId, body.propertyId, body.key, body.mimeType);
  }

  @Public()
  @UseGuards(PortalCustomerGuard)
  @Post('service-requests')
  createServiceRequest(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer, @Body() dto: CreateServiceRequestDto) {
    return this.data.createServiceRequest(customer.companyId, customer.customerId, dto);
  }

  @Public()
  @UseGuards(PortalCustomerGuard)
  @Get('service-requests')
  getServiceRequests(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer) {
    return this.data.getServiceRequests(customer.companyId, customer.customerId);
  }

  @Public()
  @UseGuards(PortalCustomerGuard)
  @Post('chat')
  async postChat(@CurrentPortalCustomer() customer: AuthenticatedPortalCustomer, @Body() dto: PortalChatDto) {
    return this.chat.chat(customer.companyId, customer.customerId, dto.message, dto.history ?? []);
  }

}
