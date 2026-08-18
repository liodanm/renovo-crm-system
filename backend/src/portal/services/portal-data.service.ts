import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { logAutomationEvent } from '../../common/utils/automation-event.util';
import { JobsService } from '../../jobs/services/jobs.service';
import { CustomersService } from '../../customers/services/customers.service';
import { CompanyContextService } from '../../documents/services/company-context.service';
import { MailService } from '../../mail/mail.service';
import { ConfigService } from '@nestjs/config';

/**
 * Every method here takes `customerId` as an explicit, required parameter
 * and includes it in the Prisma `where` clause — never just `companyId`
 * alone. This is intentionally redundant with (not a replacement for) the
 * database's own Row-Level Security: RLS enforces the tenant boundary,
 * this enforces the customer boundary, and neither one alone is sufficient
 * for a portal where two different customers of the SAME company must
 * never see each other's data.
 */
@Injectable()
export class PortalDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jobsService: JobsService,
    private readonly customersService: CustomersService,
    private readonly companyContext: CompanyContextService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  async getEstimates(companyId: string, customerId: string) {
    // Explicit select, not include — Prisma's default with only
    // `include` returns every scalar column, which would silently leak
    // internalNotes (staff-only) to the customer the moment it exists
    // on the model. Naming every field here is the real guarantee.
    return this.prisma.estimate.findMany({
      where: { companyId, customerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, estimateNumber: true, status: true, subtotal: true, discountAmount: true,
        taxRate: true, taxAmount: true, totalAmount: true, validUntil: true, sentAt: true,
        viewedAt: true, acceptedAt: true, declinedAt: true, notes: true, terms: true, createdAt: true,
        property: { select: { addressLine1: true, city: true, state: true } },
      },
    });
  }

  async approveEstimate(companyId: string, customerId: string, estimateId: string, signatureDataUrl: string) {
    const estimate = await this.getOwnedEstimate(companyId, customerId, estimateId);
    if (estimate.status === 'accepted') throw new BadRequestException('This estimate has already been approved');
    if (estimate.status === 'declined') throw new BadRequestException('This estimate was already declined and can no longer be accepted');
    if (estimate.status === 'expired') throw new BadRequestException('This estimate has expired and can no longer be accepted. Please contact us for an updated quote.');

    const updated = await this.prisma.tenant.estimate.update({
      where: { id: estimateId },
      data: { status: 'accepted', acceptedAt: new Date(), signatureDataUrl, acceptedVia: 'portal' },
      select: { id: true, status: true, acceptedAt: true, totalAmount: true, estimateNumber: true },
    });
    await this.writeEstimateHistory(companyId, estimateId, estimate.status, 'accepted', null, 'portal', 'Accepted by customer via portal');
    await logAutomationEvent(this.prisma, {
      companyId,
      customerId,
      ruleType: 'estimate_approved',
      dedupeKey: `estimate-approved-${estimateId}`,
      messageBody: `Estimate ${estimate.estimateNumber} approved by customer`,
    });

    // Same automatic conversion as staff acceptance — a customer
    // accepting from the portal should mean exactly the same thing as
    // office staff recording it, not a second, lesser path.
    const job = await this.jobsService.createFromEstimate(companyId, estimateId);
    await this.writeEstimateHistory(companyId, estimateId, 'accepted', 'accepted', null, 'portal', `Job ${job.jobNumber} created automatically`);

    // Same shared method EstimatesService.acceptManually calls — one
    // implementation of this transition, not two.
    await this.customersService.convertLeadToActiveIfNeeded(companyId, customerId);

    return updated;
  }

  async declineEstimate(companyId: string, customerId: string, estimateId: string) {
    const estimate = await this.getOwnedEstimate(companyId, customerId, estimateId);
    const updated = await this.prisma.tenant.estimate.update({
      where: { id: estimateId },
      data: { status: 'declined', declinedAt: new Date() },
      select: { id: true, status: true, declinedAt: true, estimateNumber: true },
    });
    await this.writeEstimateHistory(companyId, estimateId, estimate.status, 'declined', null, 'portal', 'Declined by customer via portal');
    await logAutomationEvent(this.prisma, {
      companyId,
      customerId,
      ruleType: 'estimate_declined',
      dedupeKey: `estimate-declined-${estimateId}`,
      messageBody: `Estimate ${estimate.estimateNumber} declined by customer`,
    });
    return updated;
  }

  /** Same shape as EstimatesService's own writer — portal-initiated changes go through the identical audit table, not a second one. */
  private async writeEstimateHistory(companyId: string, estimateId: string, fromStatus: string | null, toStatus: string, changedByUserId: string | null, source: string, note: string) {
    await this.prisma.withTenantContext(companyId, (tx) => tx.$executeRaw`
      INSERT INTO estimate_status_history (company_id, estimate_id, from_status, to_status, changed_by_user_id, source, note)
      VALUES (${companyId}::uuid, ${estimateId}::uuid, ${fromStatus}, ${toStatus}, ${changedByUserId}::uuid, ${source}, ${note})
    `);
  }

  private async getOwnedEstimate(companyId: string, customerId: string, estimateId: string) {
    const estimate = await this.prisma.estimate.findFirst({ where: { id: estimateId, companyId, customerId } });
    if (!estimate) throw new NotFoundException('Estimate not found');
    return estimate;
  }

  /** Full includes for PDF generation — kept separate from the lightweight
   * getOwnedEstimate() above (used by approve/decline, which only need
   * the status field) rather than loading line items/customer/property
   * on every call that doesn't need them. */
  async getEstimateForPdf(companyId: string, customerId: string, estimateId: string) {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id: estimateId, companyId, customerId },
      include: { customer: true, property: true, lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!estimate) throw new NotFoundException('Estimate not found');
    return estimate;
  }

  async getInvoices(companyId: string, customerId: string) {
    return this.prisma.invoice.findMany({
      where: { companyId, customerId },
      orderBy: { createdAt: 'desc' },
      include: { payments: { where: { status: 'succeeded' }, select: { amount: true, paymentDate: true, processedAt: true, method: true } } },
    });
  }

  async getOwnedInvoice(companyId: string, customerId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId, customerId },
      include: {
        customer: true,
        property: true,
        job: { include: { property: true } },
        estimate: { select: { estimateNumber: true } },
        payments: { where: { status: 'succeeded' }, select: { amount: true, paymentDate: true, processedAt: true, method: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  /** Full data for PDF generation — invoice_line_items isn't wired as a
   * typed Prisma relation on Invoice yet, so line items are fetched with
   * one small raw query rather than left out of the customer's PDF. */
  async getInvoiceForPdf(companyId: string, customerId: string, invoiceId: string) {
    const invoice = await this.getOwnedInvoice(companyId, customerId, invoiceId);
    const lineItems = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw<any[]>`
      SELECT description, quantity, unit_price AS "unitPrice", total, unit_of_measure AS "unitOfMeasure"
      FROM invoice_line_items WHERE invoice_id = ${invoiceId}::uuid AND company_id = ${companyId}::uuid ORDER BY sort_order ASC
    `);
    return { ...invoice, lineItems };
  }

  /**
   * Stamps viewedAt the first time a customer actually opens their
   * estimate/invoice PDF — this is the real signal "Estimate Viewed"/
   * "Invoice Viewed" automation depends on, not just "an email was sent."
   * Only ever set once: a customer reopening the same PDF later
   * shouldn't reset when the business considers it "first viewed."
   */
  async markEstimateViewed(companyId: string, customerId: string, estimateId: string) {
    const estimate = await this.getOwnedEstimate(companyId, customerId, estimateId);
    // A genuinely new view is either the first one ever, or one
    // happening after the estimate was reopened and resent — sentAt
    // gets a fresh timestamp on every real send (see
    // EstimatesService.send()), so comparing against it is what lets a
    // resent estimate become "Viewed" again without needing a second
    // column or table. A plain refresh within the same cycle always has
    // viewedAt >= sentAt and is correctly treated as a no-op below.
    const isNewView = !estimate.viewedAt || estimate.viewedAt < estimate.sentAt!;
    if (isNewView) {
      // Only transitions status when it's still 'sent' — an estimate
      // already accepted/declined/expired/converted must never be
      // demoted back to 'viewed' just because the customer revisits the
      // page. viewedAt itself is still recorded regardless, as a factual
      // "when did they most recently open it" timestamp independent of
      // status.
      const shouldTransitionStatus = estimate.status === 'sent';
      await this.prisma.tenant.estimate.update({
        where: { id: estimateId },
        data: { viewedAt: new Date(), ...(shouldTransitionStatus ? { status: 'viewed' } : {}) },
      });
      if (shouldTransitionStatus) {
        await this.writeEstimateHistory(companyId, estimateId, estimate.status, 'viewed', null, 'portal', 'Viewed by customer via portal');
      }
      await logAutomationEvent(this.prisma, {
        companyId,
        customerId,
        ruleType: 'estimate_viewed',
        // Cycle-aware, not just estimateId — otherwise logAutomationEvent's
        // own permanent ON CONFLICT(company_id, dedupe_key) DO NOTHING
        // would silently suppress this log entry forever after the very
        // first view, even on a legitimate later resend-and-review cycle.
        // sentAt changes on every real send, so this correctly allows one
        // entry per cycle while still blocking any duplicate within it.
        dedupeKey: `estimate-viewed-${estimateId}-${estimate.sentAt!.getTime()}`,
        messageBody: `Estimate ${estimate.estimateNumber} viewed by customer`,
      });
      await this.sendEstimateViewedNotification(companyId, estimateId);
    }
  }

  /**
   * Fire-and-forget internal notification — a delivery failure here must
   * never surface to the customer or block their view. MailService's own
   * enqueue() already swallows and logs queue errors internally, so this
   * try/catch only guards the lookups (company reply-to email, estimate
   * detail) that happen before the send itself.
   */
  private async sendEstimateViewedNotification(companyId: string, estimateId: string): Promise<void> {
    try {
      const to = await this.companyContext.getReplyToEmail(companyId);
      if (!to) return; // no configured business email — nothing to notify

      const estimate = await this.prisma.estimate.findUnique({
        where: { id: estimateId },
        include: { customer: true, lineItems: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!estimate) return;

      const customerName = estimate.customer.businessName ?? `${estimate.customer.firstName ?? ''} ${estimate.customer.lastName ?? ''}`.trim();
      const description = estimate.lineItems.map((li) => li.customServiceName || li.description).filter(Boolean).join(', ') || 'Estimate';
      const staffUrl = `${this.config.get('auth.frontendUrl') ?? ''}/estimates/${estimateId}`;

      await this.mailService.sendEstimateViewedNotification(to, {
        customerName,
        estimateNumber: estimate.estimateNumber,
        description,
        totalFormatted: `$${Number(estimate.totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        viewedAtFormatted: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        estimateUrl: staffUrl,
      });
    } catch {
      // Never let a notification failure affect the customer's own
      // portal view — same principle as logAutomationEvent's own
      // catch-and-swallow just above.
    }
  }

  /**
   * Option A: viewing an Invoice is tracked purely via viewedAt — it
   * NEVER touches status. Invoice status is owned exclusively by
   * computeInvoiceStatusAfterPayment() (draft/sent/partial/paid/void);
   * a "Viewed" status was deliberately rejected during design to avoid
   * that function silently demoting a viewed invoice back to 'sent' on
   * its next payment check. Cycle-aware exactly like
   * markEstimateViewed(): sentAt refreshes on every real resend (see
   * InvoicesService.send()), so comparing against it lets a resent
   * invoice register as newly viewed again without a second column.
   */
  async markInvoiceViewed(companyId: string, customerId: string, invoiceId: string) {
    const invoice = await this.getOwnedInvoice(companyId, customerId, invoiceId);
    const isNewView = !invoice.viewedAt || (invoice.sentAt != null && invoice.viewedAt < invoice.sentAt);
    if (isNewView) {
      await this.prisma.tenant.invoice.update({ where: { id: invoiceId }, data: { viewedAt: new Date() } });
      await logAutomationEvent(this.prisma, {
        companyId,
        customerId,
        ruleType: 'invoice_viewed',
        // Cycle-aware, not just invoiceId — same fix already applied to
        // Estimate viewing: a static key would hit logAutomationEvent's
        // permanent ON CONFLICT(company_id, dedupe_key) DO NOTHING and
        // silently stop recording after the very first view, even on a
        // legitimate later resend-and-review cycle.
        dedupeKey: `invoice-viewed-${invoiceId}-${(invoice.sentAt ?? invoice.createdAt).getTime()}`,
        messageBody: `Invoice ${invoice.invoiceNumber} viewed by customer`,
      });
      await this.sendInvoiceViewedNotification(companyId, invoiceId);
    }
  }

  private async sendInvoiceViewedNotification(companyId: string, invoiceId: string): Promise<void> {
    try {
      const to = await this.companyContext.getReplyToEmail(companyId);
      if (!to) return;

      const invoice = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { customer: true, property: true },
      });
      if (!invoice) return;

      const customerName = invoice.customer.businessName ?? `${invoice.customer.firstName ?? ''} ${invoice.customer.lastName ?? ''}`.trim();
      const staffUrl = `${this.config.get('auth.frontendUrl') ?? ''}/invoices/${invoiceId}`;

      await this.mailService.sendInvoiceViewedNotification(to, {
        customerName,
        customerEmail: invoice.customer.email ?? '',
        invoiceNumber: invoice.invoiceNumber,
        totalFormatted: `$${Number(invoice.totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        viewedAtFormatted: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        propertyAddress: invoice.property ? `${invoice.property.addressLine1}, ${invoice.property.city}, ${invoice.property.state} ${invoice.property.postalCode}` : null,
        invoiceUrl: staffUrl,
      });
    } catch {
      // Same principle as sendEstimateViewedNotification's catch above —
      // never let a notification failure affect the customer's own
      // portal view.
    }
  }

  async getServiceHistory(companyId: string, customerId: string) {
    const jobs = await this.prisma.job.findMany({
      where: { companyId, customerId, status: 'completed' },
      orderBy: { scheduledStart: 'desc' },
      include: { property: { select: { addressLine1: true, city: true } } },
    });
    return jobs.map((j) => ({
      id: j.id,
      title: j.title,
      completedAt: j.scheduledStart,
      address: `${j.property.addressLine1}, ${j.property.city}`,
      price: j.price.toNumber(),
    }));
  }

  // ===========================================================================
  // Photo uploads — same presigned-URL pattern as the staff-facing customer
  // photo gallery, scoped so a customer can only attach photos to their own
  // properties, never an arbitrary propertyId they happen to guess.
  // ===========================================================================

  async presignPhotoUpload(companyId: string, customerId: string, propertyId: string, fileName: string, mimeType: string) {
    await this.assertOwnedProperty(companyId, customerId, propertyId);
    const key = this.storage.buildKey(companyId, 'photos', fileName);
    const uploadUrl = await this.storage.getPresignedUploadUrl(key, mimeType);
    return { uploadUrl, key };
  }

  async confirmPhotoUpload(companyId: string, customerId: string, propertyId: string, key: string, mimeType?: string) {
    await this.assertOwnedProperty(companyId, customerId, propertyId);
    if (!key.startsWith(`${companyId}/`)) throw new BadRequestException('Invalid upload key');

    return this.prisma.photo.create({
      data: { companyId, customerId, propertyId, photoType: 'other', s3KeyOriginal: key, mimeType },
    });
  }

  private async assertOwnedProperty(companyId: string, customerId: string, propertyId: string) {
    const property = await this.prisma.property.findFirst({ where: { id: propertyId, companyId, customerId } });
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  async getProperties(companyId: string, customerId: string) {
    return this.prisma.property.findMany({ where: { companyId, customerId, deletedAt: null } });
  }

  // ===========================================================================
  // Service requests — customer-initiated, one/recurring, always lands as
  // 'pending' for staff review (see architecture note: never auto-scheduled).
  // ===========================================================================

  async createServiceRequest(
    companyId: string,
    customerId: string,
    input: { propertyId?: string; description: string; requestedServiceType?: string; isRecurring?: boolean; recurringFrequency?: string; preferredDates?: string },
  ) {
    if (input.propertyId) await this.assertOwnedProperty(companyId, customerId, input.propertyId);
    return this.prisma.serviceRequest.create({
      data: {
        companyId,
        customerId,
        propertyId: input.propertyId,
        description: input.description,
        requestedServiceType: input.requestedServiceType,
        isRecurring: input.isRecurring ?? false,
        recurringFrequency: input.recurringFrequency,
        preferredDates: input.preferredDates,
        status: 'pending',
      },
    });
  }

  async getServiceRequests(companyId: string, customerId: string) {
    return this.prisma.serviceRequest.findMany({ where: { companyId, customerId }, orderBy: { createdAt: 'desc' } });
  }

  // ===========================================================================
  // Dashboard — one composed, read-only response. This is the ONLY new
  // business logic in this feature (the appointments read); everything
  // else below reuses the exact methods already defined above in this
  // same class, or CompanyContextService, which the controller already
  // used for PDF generation. Nothing here recalculates anything — it
  // reads already-computed fields (Estimate.totalAmount,
  // Invoice.balanceDue) and only does the kind of harmless, unavoidable
  // aggregation a dashboard needs (counting, summing, picking the first
  // item off an already-sorted list), never re-deriving a financial
  // number a service already owns.
  // ===========================================================================

  /**
   * Reuses the exact same `appointments` table SchedulingService already
   * owns — same raw-SQL style, same column names — filtered by both
   * companyId and customerId (the same double-scoping every other
   * method in this file already enforces). This is a read-only query;
   * it introduces no new write path and no second scheduling concept.
   */
  async getUpcomingAppointments(companyId: string, customerId: string, limit = 5) {
    return this.prisma.withTenantContext(companyId, (tx) =>
      tx.$queryRawUnsafe<
        { id: string; jobId: string | null; title: string; startsAt: Date; endsAt: Date; status: string }[]
      >(
        `SELECT id, job_id AS "jobId", title, starts_at AS "startsAt", ends_at AS "endsAt", status
         FROM appointments
         WHERE company_id = $1::uuid AND customer_id = $2::uuid
           AND status IN ('scheduled', 'confirmed') AND starts_at >= now()
         ORDER BY starts_at ASC
         LIMIT $3`,
        companyId,
        customerId,
        limit,
      ),
    );
  }

  async getDashboard(companyId: string, customerId: string) {
    const [customer, { company, branding }, estimates, invoices, serviceHistory, upcomingAppointments] = await Promise.all([
      this.prisma.customer.findFirst({
        where: { id: customerId, companyId },
        select: { firstName: true, lastName: true, businessName: true },
      }),
      this.companyContext.getCompanyAndBranding(companyId),
      this.getEstimates(companyId, customerId),
      this.getInvoices(companyId, customerId),
      this.getServiceHistory(companyId, customerId),
      this.getUpcomingAppointments(companyId, customerId),
    ]);
    if (!customer) throw new NotFoundException('Customer not found');

    const openEstimates = estimates.filter((e: any) => ['draft', 'sent', 'viewed'].includes(e.status));
    const openInvoices = invoices.filter((i: any) => !['paid', 'void', 'draft'].includes(i.status));
    // balanceDue is already a real, stored/generated column on Invoice
    // (confirmed against schema.prisma) — summing it across open
    // invoices is the only arithmetic here, and it's a sum of an
    // already-correct per-invoice figure, not a re-derivation of it.
    const outstandingBalance = openInvoices.reduce((sum: number, i: any) => sum + Number(i.balanceDue ?? 0), 0);
    const lastCompletedService = serviceHistory[0] ?? null;

    return {
      customer: {
        name: customer.businessName || [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'there',
      },
      company: { name: company.dba || company.name, logoUrl: branding.logoUrl },
      outstandingBalance,
      openEstimatesCount: openEstimates.length,
      openInvoicesCount: openInvoices.length,
      upcomingAppointments,
      lastCompletedService,
    };
  }
}
