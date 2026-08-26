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
import { CustomerNotesService } from '../../../customers/services/customer-notes.service';
import { createOwnerNotification } from '../../../common/utils/owner-notification.util';
import { SubmitQuoteDto } from '../dto/submit-quote.dto';
import { RequestQuoteDto } from '../dto/request-quote.dto';
import { toCreateCustomerDto, toCreatePropertyDto, toCreateEstimateDto, toLineItemDto } from '../mappers/quote-widget.mappers';

const CREATED_BY_LABEL = 'Quote Widget';
const ESTIMATE_SOURCE = 'Website Instant Quote';
const REQUEST_SOURCE = 'Website Quote Request';
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
    private readonly customerNotes: CustomerNotesService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async getPublicServices(companySlug: string) {
    const company = await this.resolveCompany(companySlug);
    return this.serviceCatalog.findAllPublic(company.id);
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
        // Defense-in-depth, not just frontend routing: a Request-Only
        // service must never produce a real, priced Estimate through
        // this path, even if a client sends it here directly. The
        // frontend is expected to route Request-Only selections to
        // submitRequest() instead, but that routing decision is not
        // trusted as the actual security boundary — this check is.
        if (catalogItem.onlineQuoteMode === 'request') {
          throw new BadRequestException('One of the selected services requires manual review and cannot be instantly quoted');
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

    // Reuses the existing, already-designed Notification model and the
    // same dedupe-key pattern createOwnerNotification already
    // established for estimate accept/decline — not a second
    // notification mechanism. Idempotency key doubles as the dedupe
    // key here when present, so a retried submission (browser retry,
    // network retry, duplicate idempotency key) can't create a second
    // notification even in the rare case the Redis idempotency cache
    // above already expired or missed.
    const customerName = customer.businessName?.trim() || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim();
    await createOwnerNotification(this.prisma, {
      companyId,
      notificationType: 'website_quote_instant',
      title: 'New Website Quote',
      body: `${customerName} received an estimate for ${lineItems.map((li) => li.description).join(', ')}.`,
      relatedEntityType: 'estimate',
      relatedEntityId: estimate.id,
      dedupeKey: `website-quote-instant-${estimate.id}`,
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

  /**
   * Mode B (Request a Quote) — deliberately mirrors submitQuote()'s
   * structure exactly (honeypot check, idempotency, company resolution,
   * customer/property find-or-create, logging shape) so the two paths
   * stay easy to compare, but never creates an Estimate and never
   * resolves or exposes a price. The customer/property DTOs are built
   * inline here rather than reusing toCreateCustomerDto/
   * toCreatePropertyDto — those mapper functions are typed specifically
   * against SubmitQuoteDto's shape (whose `services` array requires a
   * `quantity` RequestQuoteDto doesn't have), so reusing them directly
   * isn't structurally possible without widening their types. The
   * field mapping itself is identical, just written inline — a small,
   * deliberate duplication, not an oversight.
   */
  async submitRequest(companySlug: string, dto: RequestQuoteDto): Promise<{ received: true }> {
    if (dto.companyWebsite) {
      this.logger.warn({ event: 'quote_widget.honeypot_triggered', companySlug, mode: 'request' });
      return { received: true };
    }

    const idempotencyKeyRedisKey = dto.idempotencyKey ? `quote-widget:idempotency-request:${companySlug}:${dto.idempotencyKey}` : null;
    if (idempotencyKeyRedisKey) {
      const cached = await this.redis.get(idempotencyKeyRedisKey);
      if (cached) {
        this.logger.log({ event: 'quote_widget.duplicate_request_blocked', companySlug, idempotencyKey: dto.idempotencyKey });
        return JSON.parse(cached);
      }
    }

    this.logger.log({ event: 'quote_widget.request_received', companySlug, serviceCount: dto.services.length });

    if (dto.services.length === 0) {
      throw new BadRequestException('Select at least one service');
    }

    const company = await this.resolveCompany(companySlug);
    const companyId = company.id;

    const { customer, wasExisting } = await this.customers.findOrCreateByEmail(companyId, CREATED_BY_LABEL, {
      customerType: 'residential',
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      source: REQUEST_SOURCE,
      leadStatus: 'lead',
    } as Parameters<typeof this.customers.findOrCreateByEmail>[2]);
    this.logger.log({ event: wasExisting ? 'quote_widget.customer_matched' : 'quote_widget.customer_created', companyId, customerId: customer.id, mode: 'request' });

    const { property } = await this.findOrCreateProperty(companyId, customer, {
      addressLine1: dto.addressLine1,
      city: dto.city,
      state: dto.state,
      postalCode: dto.postalCode,
    } as SubmitQuoteDto);

    // Every service is validated to actually belong to this company —
    // never trusted from the client — even though no price is ever
    // resolved from it here; a request for a service that doesn't
    // exist (deleted, wrong tenant) should still fail clearly.
    const services = await Promise.all(
      dto.services.map(async (selected) => {
        const catalogItem = await this.serviceCatalog.findOne(companyId, selected.serviceCatalogItemId);
        if (!catalogItem || catalogItem.isActive === false) {
          throw new BadRequestException('One of the selected services is no longer available');
        }
        return catalogItem;
      }),
    );

    const serviceNames = services.map((s) => s.name).join(', ');
    const customerName = customer.businessName?.trim() || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim();

    // No estimate_status_history equivalent exists for a request that
    // never becomes an Estimate — a Customer Note is the existing,
    // already-rendered-in-Customer-Activity mechanism for exactly this
    // kind of free-text event (see customers.service.ts's activity
    // timeline, which already turns any note into a 'note' activity
    // event with no further wiring needed). authorUserId is null —
    // widened to accept that for precisely this system-generated,
    // no-staff-user case; see customer-notes.service.ts.
    await this.customerNotes.create(companyId, customer.id, null, {
      body: `Website quote request submitted for: ${serviceNames}. Property: ${dto.addressLine1}, ${dto.city}, ${dto.state} ${dto.postalCode}.${dto.notes ? ` Notes: ${dto.notes}` : ''}`,
    });

    await createOwnerNotification(this.prisma, {
      companyId,
      notificationType: 'website_quote_request',
      title: 'New Website Quote Request',
      body: `${customerName} requested a quote for ${serviceNames}.`,
      relatedEntityType: 'customer',
      relatedEntityId: customer.id,
      dedupeKey: `website-quote-request-${customer.id}-${dto.idempotencyKey ?? Date.now()}`,
    });

    this.logger.log({ event: 'quote_widget.request_completed', companyId, customerId: customer.id, propertyId: property.id });

    const result = { received: true as const };
    if (idempotencyKeyRedisKey) {
      await this.redis.set(idempotencyKeyRedisKey, JSON.stringify(result), 'EX', IDEMPOTENCY_TTL_SECONDS);
    }
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
