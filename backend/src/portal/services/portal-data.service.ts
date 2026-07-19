import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { logAutomationEvent } from '../../common/utils/automation-event.util';

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
  ) {}

  async getEstimates(companyId: string, customerId: string) {
    return this.prisma.estimate.findMany({
      where: { companyId, customerId },
      orderBy: { createdAt: 'desc' },
      include: { property: { select: { addressLine1: true, city: true, state: true } } },
    });
  }

  async approveEstimate(companyId: string, customerId: string, estimateId: string, signatureDataUrl: string) {
    const estimate = await this.getOwnedEstimate(companyId, customerId, estimateId);
    if (estimate.status === 'accepted') throw new BadRequestException('This estimate has already been approved');

    const updated = await this.prisma.estimate.update({
      where: { id: estimateId },
      data: { status: 'accepted', acceptedAt: new Date(), signatureDataUrl },
    });
    await logAutomationEvent(this.prisma, {
      companyId,
      customerId,
      ruleType: 'estimate_approved',
      dedupeKey: `estimate-approved-${estimateId}`,
      messageBody: `Estimate ${estimate.estimateNumber} approved by customer`,
    });
    return updated;
  }

  async declineEstimate(companyId: string, customerId: string, estimateId: string) {
    const estimate = await this.getOwnedEstimate(companyId, customerId, estimateId);
    const updated = await this.prisma.estimate.update({ where: { id: estimateId }, data: { status: 'declined', declinedAt: new Date() } });
    await logAutomationEvent(this.prisma, {
      companyId,
      customerId,
      ruleType: 'estimate_declined',
      dedupeKey: `estimate-declined-${estimateId}`,
      messageBody: `Estimate ${estimate.estimateNumber} declined by customer`,
    });
    return updated;
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
      include: { payments: { where: { status: 'succeeded' }, select: { amount: true, processedAt: true, method: true } } },
    });
  }

  async getOwnedInvoice(companyId: string, customerId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId, customerId },
      include: {
        customer: true,
        property: true,
        job: { include: { property: true } },
        payments: { where: { status: 'succeeded' }, select: { amount: true, processedAt: true, method: true } },
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
    if (!estimate.viewedAt) {
      await this.prisma.estimate.update({ where: { id: estimateId }, data: { viewedAt: new Date() } });
      await logAutomationEvent(this.prisma, {
        companyId,
        customerId,
        ruleType: 'estimate_viewed',
        dedupeKey: `estimate-viewed-${estimateId}`,
        messageBody: `Estimate ${estimate.estimateNumber} viewed by customer`,
      });
    }
  }

  async markInvoiceViewed(companyId: string, customerId: string, invoiceId: string) {
    const invoice = await this.getOwnedInvoice(companyId, customerId, invoiceId);
    if (!invoice.viewedAt) {
      await this.prisma.invoice.update({ where: { id: invoiceId }, data: { viewedAt: new Date() } });
      await logAutomationEvent(this.prisma, {
        companyId,
        customerId,
        ruleType: 'invoice_viewed',
        dedupeKey: `invoice-viewed-${invoiceId}`,
        messageBody: `Invoice ${invoice.invoiceNumber} viewed by customer`,
      });
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
}
