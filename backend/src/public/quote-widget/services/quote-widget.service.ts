import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { CustomersService } from '../../../customers/services/customers.service';
import { CustomerPropertiesService } from '../../../customers/services/customer-properties.service';
import { ServiceCatalogService } from '../../../service-catalog/services/service-catalog.service';
import { EstimatesService } from '../../../estimates/services/estimates.service';
import { PortalAuthService } from '../../../portal/services/portal-auth.service';
import { CompanyContextService } from '../../../documents/services/company-context.service';
import { SubmitQuoteDto } from '../dto/submit-quote.dto';
import { toCreateCustomerDto, toCreatePropertyDto, toCreateEstimateDto, toLineItemDto } from '../mappers/quote-widget.mappers';

const CREATED_BY_LABEL = 'Quote Widget';
const ESTIMATE_SOURCE = 'Website Instant Quote';
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // covers "closed the tab, reopened it hours later, hit submit again"

interface QuoteSubmissionResult {
  estimateNumber: string;
  totalAmount: unknown;
}

/**
 * Orchestration only — every actual piece of business logic (customer
 * lookup/creation, property creation, pricing, estimate creation, email
 * delivery, portal access) lives in the service that already owned it
 * before this module existed. See PROJECT_CONTEXT.md's Quote Widget
 * section for the full verified architecture this follows.
 */
@Injectable()
export class QuoteWidgetService {
  private readonly logger = new Logger(QuoteWidgetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly customers: CustomersService,
    private readonly properties: CustomerPropertiesService,
    private readonly serviceCatalog: ServiceCatalogService,
    private readonly estimates: EstimatesService,
    private readonly portalAuth: PortalAuthService,
    private readonly companyContext: CompanyContextService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async getPublicServices(companySlug: string) {
    const company = await this.resolveCompany(companySlug);
    return this.serviceCatalog.findAll(company.id, true);
  }

  async getPublicBranding(companySlug: string) {
    const company = await this.resolveCompany(companySlug);
    const { branding } = await this.companyContext.getCompanyAndBranding(company.id);
    // Real gap found while building the public quote frontend: this
    // endpoint previously returned only the branding sub-object
    // (logoUrl/colors), discarding the company's own display name —
    // no existing public endpoint returned it at all, and the public
    // quote page genuinely needs something to show as the page/company
    // title. Smallest possible fix per the stop-condition process:
    // extend this existing response with one additional field rather
    // than create a second branding endpoint.
    return { ...branding, companyName: company.name };
  }

  async submitQuote(companySlug: string, dto: SubmitQuoteDto): Promise<QuoteSubmissionResult | { received: true }> {
    if (dto.companyWebsite) {
      this.logger.warn({ event: 'quote_widget.honeypot_triggered', companySlug });
      return { received: true };
    }

    // --- Idempotency: same key within the TTL returns the cached
    //     result instead of creating a second estimate. Same Redis
    //     instance and pattern PortalAuthService already uses for
    //     magic links — no new store introduced. ---
    const idempotencyKeyRedisKey = dto.idempotencyKey ? `quote-widget:idempotency:${companySlug}:${dto.idempotencyKey}` : null;
    if (idempotencyKeyRedisKey) {
      const cached = await this.redis.get(idempotencyKeyRedisKey);
      if (cached) {
        this.logger.log({ event: 'quote_widget.duplicate_submission_blocked', companySlug, idempotencyKey: dto.idempotencyKey });
        return JSON.parse(cached);
      }
    }

    this.logger.log({ event: 'quote_widget.submission_received', companySlug, serviceCount: dto.services.length });

    const company = await this.resolveCompany(companySlug);
    const companyId = company.id;

    // --- Customer: find-or-create, never a second creation path ---
    const { customer, wasExisting } = await this.customers.findOrCreateByEmail(companyId, CREATED_BY_LABEL, toCreateCustomerDto(dto));
    this.logger.log({ event: wasExisting ? 'quote_widget.customer_matched' : 'quote_widget.customer_created', companyId, customerId: customer.id });

    // --- Property: reuse on normalized-address match, else create ---
    const { property, wasExisting: propertyWasExisting } = await this.findOrCreateProperty(companyId, customer, dto);
    this.logger.log({ event: propertyWasExisting ? 'quote_widget.property_matched' : 'quote_widget.property_created', companyId, customerId: customer.id, propertyId: property.id });

    // --- Line items: price comes from the Service Catalog server-side,
    //     never from the client ---
    if (dto.services.length === 0) {
      throw new BadRequestException('Select at least one service');
    }
    const lineItems = await Promise.all(
      dto.services.map(async (selected) => {
        const catalogItem = await this.serviceCatalog.findOne(companyId, selected.serviceCatalogItemId);
        if (!catalogItem || catalogItem.isActive === false) {
          throw new BadRequestException('One of the selected services is no longer available');
        }
        return toLineItemDto(catalogItem, selected.quantity, selected.serviceDetails);
      }),
    );

    // --- Estimate creation + send: the one place this flow needs the
    //     manually-established tenant context (see PROJECT_CONTEXT.md's
    //     Quote Widget section for why). ---
    const estimate = await this.tenantContext.run({ companyId }, async () => {
      const created = await this.estimates.create(companyId, toCreateEstimateDto(customer.id, property.id, lineItems, dto.notes, ESTIMATE_SOURCE), false);
      this.logger.log({ event: 'quote_widget.estimate_created', companyId, customerId: customer.id, estimateId: created.id, estimateNumber: created.estimateNumber, totalAmount: created.totalAmount });

      await this.estimates.sendEmail(companyId, created.id);
      this.logger.log({ event: 'quote_widget.estimate_email_sent', companyId, estimateId: created.id });

      return created;
    });

    // --- Portal access: existing magic-link flow, unmodified ---
    await this.portalAuth.requestMagicLink(companySlug, customer.email!);
    this.logger.log({ event: 'quote_widget.portal_link_sent', companyId, customerId: customer.id, estimateId: estimate.id });

    const result: QuoteSubmissionResult = {
      estimateNumber: estimate.estimateNumber,
      totalAmount: estimate.totalAmount,
    };

    if (idempotencyKeyRedisKey) {
      await this.redis.set(idempotencyKeyRedisKey, JSON.stringify(result), 'EX', IDEMPOTENCY_TTL_SECONDS);
    }

    this.logger.log({ event: 'quote_widget.submission_completed', companyId, customerId: customer.id, estimateId: estimate.id });
    return result;
  }

  private async resolveCompany(companySlug: string) {
    const company = await this.prisma.company.findUnique({ where: { slug: companySlug } });
    if (!company || company.status === 'cancelled') {
      this.logger.warn({ event: 'quote_widget.company_not_found', companySlug });
      throw new NotFoundException('This quote page is not available');
    }
    return company;
  }

  /**
   * Normalized-address matching — deliberately the simplest honest
   * version (lowercase + trim on addressLine1, exact postalCode), not a
   * real address-standardization service, since none exists anywhere in
   * this codebase today. Documented here, not hidden.
   */
  private async findOrCreateProperty(
    companyId: string,
    customer: { id: string; properties?: { id: string; addressLine1: string; postalCode: string }[] },
    dto: SubmitQuoteDto,
  ): Promise<{ property: { id: string; addressLine1: string; postalCode: string }; wasExisting: boolean }> {
    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const existing = (customer.properties ?? []).find(
      (p) => normalize(p.addressLine1) === normalize(dto.addressLine1) && p.postalCode.trim() === dto.postalCode.trim(),
    );
    if (existing) return { property: existing, wasExisting: true };

    const created = await this.properties.create(companyId, customer.id, toCreatePropertyDto(dto));
    return { property: created, wasExisting: false };
  }
}
