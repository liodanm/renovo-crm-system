import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';

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

    return this.prisma.estimate.update({
      where: { id: estimateId },
      data: { status: 'accepted', acceptedAt: new Date(), signatureDataUrl },
    });
  }

  async declineEstimate(companyId: string, customerId: string, estimateId: string) {
    await this.getOwnedEstimate(companyId, customerId, estimateId);
    return this.prisma.estimate.update({ where: { id: estimateId }, data: { status: 'declined', declinedAt: new Date() } });
  }

  private async getOwnedEstimate(companyId: string, customerId: string, estimateId: string) {
    const estimate = await this.prisma.estimate.findFirst({ where: { id: estimateId, companyId, customerId } });
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
      include: { job: { include: { property: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
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
