import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QuoteWidgetService } from './quote-widget.service';
import { createOwnerNotification } from '../../../common/utils/owner-notification.util';

// Verifies QuoteWidgetService CALLS the shared notification utility
// correctly (right type/title/body/related entity/dedupe key) — the
// utility's own internals (Prisma raw SQL, owner-role lookup) are not
// re-tested here, this is orchestration-boundary testing only, matching
// this class's own "orchestration only" doc comment and this task's
// explicit narrow scope.
jest.mock('../../../common/utils/owner-notification.util', () => ({
  createOwnerNotification: jest.fn().mockResolvedValue(undefined),
}));
const mockCreateOwnerNotification = createOwnerNotification as jest.Mock;

const COMPANY = { id: 'company-1', slug: 'relentless', status: 'active', name: 'Relentless Pressure Wash' };
const CUSTOMER = { id: 'customer-1', firstName: 'John', lastName: 'Smith', businessName: null, email: 'john@example.com', properties: [] };
const PROPERTY = { id: 'property-1', addressLine1: '123 Main St', city: 'Coral Springs', state: 'FL', postalCode: '33065' };
const INSTANT_CATALOG_ITEM = { id: 'svc-instant', name: 'Driveway Cleaning', isActive: true, onlineQuoteMode: 'instant', defaultUnitOfMeasure: 'sq_ft', defaultUnitPrice: '0.15', serviceType: 'driveway_cleaning' };
const REQUEST_CATALOG_ITEM = { id: 'svc-request', name: 'Roof Cleaning', isActive: true, onlineQuoteMode: 'request', defaultUnitOfMeasure: 'sq_ft', defaultUnitPrice: '0.25', serviceType: 'roof_cleaning' };
const CREATED_ESTIMATE = { id: 'estimate-1', estimateNumber: 'EST-1001', totalAmount: '150.00', customerId: 'customer-1', propertyId: 'property-1' };

function buildService(overrides: Partial<Record<string, any>> = {}) {
  const redisStore = new Map<string, string>();
  const prisma = {
    company: { findUnique: jest.fn().mockResolvedValue(COMPANY) },
    withTenantContext: jest.fn((companyId: string, fn: (tx: any) => any) => fn({})),
    ...overrides.prisma,
  };
  const tenantContext = { run: jest.fn((_ctx: any, fn: () => any) => fn()) };
  const customers = {
    findOrCreateByEmail: jest.fn().mockResolvedValue({ customer: CUSTOMER, wasExisting: false }),
    ...overrides.customers,
  };
  const properties = {
    create: jest.fn().mockResolvedValue(PROPERTY),
    ...overrides.properties,
  };
  const serviceCatalog = {
    findOne: jest.fn().mockResolvedValue(INSTANT_CATALOG_ITEM),
    findAllPublic: jest.fn().mockResolvedValue([]),
    ...overrides.serviceCatalog,
  };
  const estimates = {
    create: jest.fn().mockResolvedValue(CREATED_ESTIMATE),
    sendEmail: jest.fn().mockResolvedValue(undefined),
    ...overrides.estimates,
  };
  const portalAuth = {
    requestMagicLink: jest.fn().mockResolvedValue(undefined),
    ...overrides.portalAuth,
  };
  const companyContext = {
    getCompanyAndBranding: jest.fn().mockResolvedValue({ branding: { logoUrl: null, primaryColor: null } }),
    ...overrides.companyContext,
  };
  const customerNotes = {
    create: jest.fn().mockResolvedValue({ id: 'note-1' }),
    ...overrides.customerNotes,
  };
  const redis = {
    get: jest.fn((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
    set: jest.fn((key: string, value: string) => {
      redisStore.set(key, value);
      return Promise.resolve('OK');
    }),
    ...overrides.redis,
  };

  const service = new QuoteWidgetService(
    prisma as any,
    tenantContext as any,
    customers as any,
    properties as any,
    serviceCatalog as any,
    estimates as any,
    portalAuth as any,
    companyContext as any,
    customerNotes as any,
    redis as any,
  );

  return { service, prisma, tenantContext, customers, properties, serviceCatalog, estimates, portalAuth, companyContext, customerNotes, redis, redisStore };
}

function submitDto(overrides: Partial<any> = {}) {
  return {
    firstName: 'John',
    lastName: 'Smith',
    email: 'john@example.com',
    phone: '9545551234',
    addressLine1: '123 Main St',
    city: 'Coral Springs',
    state: 'FL',
    postalCode: '33065',
    services: [{ serviceCatalogItemId: 'svc-instant', quantity: 500 }],
    ...overrides,
  };
}
function requestDto(overrides: Partial<any> = {}) {
  return {
    firstName: 'John',
    lastName: 'Smith',
    email: 'john@example.com',
    phone: '9545551234',
    addressLine1: '123 Main St',
    city: 'Coral Springs',
    state: 'FL',
    postalCode: '33065',
    services: [{ serviceCatalogItemId: 'svc-request' }],
    ...overrides,
  };
}

beforeEach(() => {
  mockCreateOwnerNotification.mockClear();
});

describe('QuoteWidgetService — tenant resolution & security', () => {
  it('Test — resolves the company exclusively from companySlug, never from any client-supplied field', async () => {
    const { service, prisma } = buildService();
    await service.submitQuote('relentless', submitDto());
    expect(prisma.company.findUnique).toHaveBeenCalledWith({ where: { slug: 'relentless' } });
  });

  it('Test — invalid company slug returns a generic 404, not a distinguishable error', async () => {
    const { service, prisma } = buildService({ prisma: { company: { findUnique: jest.fn().mockResolvedValue(null) } } });
    await expect(service.submitQuote('does-not-exist', submitDto())).rejects.toThrow(NotFoundException);
    await expect(service.submitQuote('does-not-exist', submitDto())).rejects.toThrow('This quote page is not available');
  });

  it('Test — a cancelled company produces the exact same generic message as a nonexistent one (no enumeration signal)', async () => {
    const { service } = buildService({ prisma: { company: { findUnique: jest.fn().mockResolvedValue({ ...COMPANY, status: 'cancelled' }) } } });
    await expect(service.submitQuote('relentless', submitDto())).rejects.toThrow('This quote page is not available');
  });

  it('Test — a client-supplied companyId field is never read; only companySlug drives tenant resolution', async () => {
    const { service, prisma } = buildService();
    await service.submitQuote('relentless', submitDto({ companyId: 'some-other-company-id' }));
    expect(prisma.company.findUnique).toHaveBeenCalledWith({ where: { slug: 'relentless' } });
    expect(prisma.company.findUnique).not.toHaveBeenCalledWith({ where: { slug: 'some-other-company-id' } });
  });

  it('Test — a client-supplied price/total on a service selection is never read; only serviceCatalogItemId and quantity are used to resolve pricing', async () => {
    const { service, serviceCatalog } = buildService();
    await service.submitQuote(
      'relentless',
      submitDto({ services: [{ serviceCatalogItemId: 'svc-instant', quantity: 500, price: 0.01, total: 5, unitPrice: 0.01 }] }),
    );
    // The only thing ever consulted for price is the catalog item resolved server-side by ID.
    expect(serviceCatalog.findOne).toHaveBeenCalledWith('company-1', 'svc-instant');
  });

  it('Test — honeypot field triggers a silent no-op: no customer, no estimate, no notification', async () => {
    const { service, customers, estimates } = buildService();
    const result = await service.submitQuote('relentless', submitDto({ companyWebsite: 'http://spam.example' }));
    expect(result).toEqual({ received: true });
    expect(customers.findOrCreateByEmail).not.toHaveBeenCalled();
    expect(estimates.create).not.toHaveBeenCalled();
    expect(mockCreateOwnerNotification).not.toHaveBeenCalled();
  });

  it('Test — honeypot also silently no-ops on the Request-Only path', async () => {
    const { service, customers } = buildService();
    const result = await service.submitRequest('relentless', requestDto({ companyWebsite: 'http://spam.example' }));
    expect(result).toEqual({ received: true });
    expect(customers.findOrCreateByEmail).not.toHaveBeenCalled();
  });

  it('Test — no services selected is rejected before any customer/property is created', async () => {
    const { service, customers } = buildService();
    await expect(service.submitQuote('relentless', submitDto({ services: [] }))).rejects.toThrow(BadRequestException);
    expect(customers.findOrCreateByEmail).not.toHaveBeenCalled();
  });
});

describe('QuoteWidgetService — Instant Quote', () => {
  it('Test — creates a real Estimate using the price resolved from the authoritative Service Catalog item', async () => {
    const { service, estimates } = buildService();
    const result = await service.submitQuote('relentless', submitDto());
    expect(estimates.create).toHaveBeenCalledTimes(1);
    const [companyIdArg, estimateDtoArg] = estimates.create.mock.calls[0];
    expect(companyIdArg).toBe('company-1');
    expect(estimateDtoArg.lineItems[0].unitPrice).toBe(0.15); // from INSTANT_CATALOG_ITEM.defaultUnitPrice, never from the client
    expect(result).toEqual({ estimateNumber: 'EST-1001', totalAmount: '150.00' });
  });

  it('Test — the Estimate is created against the correct customer and property', async () => {
    const { service, estimates } = buildService();
    await service.submitQuote('relentless', submitDto());
    const [, estimateDtoArg] = estimates.create.mock.calls[0];
    expect(estimateDtoArg.customerId).toBe('customer-1');
    expect(estimateDtoArg.propertyId).toBe('property-1');
  });

  it('Test — the existing estimate email flow (which uses the permanent portal-document-token system) is triggered', async () => {
    const { service, estimates } = buildService();
    await service.submitQuote('relentless', submitDto());
    expect(estimates.sendEmail).toHaveBeenCalledWith('company-1', 'estimate-1');
  });

  it('Test — an owner notification is created with the correct type, related entity, and dedupe key', async () => {
    const { service } = buildService();
    await service.submitQuote('relentless', submitDto());
    expect(mockCreateOwnerNotification).toHaveBeenCalledTimes(1);
    const [, payload] = mockCreateOwnerNotification.mock.calls[0];
    expect(payload.companyId).toBe('company-1');
    expect(payload.notificationType).toBe('website_quote_instant');
    expect(payload.relatedEntityType).toBe('estimate');
    expect(payload.relatedEntityId).toBe('estimate-1');
    expect(payload.dedupeKey).toBe('website-quote-instant-estimate-1');
  });
});

describe('QuoteWidgetService — Request-Only cannot be bypassed', () => {
  it('Test — calling submitQuote() directly with a Request-Only service is rejected, even though the frontend is expected to route it to submitRequest() instead', async () => {
    const { service, estimates } = buildService({ serviceCatalog: { findOne: jest.fn().mockResolvedValue(REQUEST_CATALOG_ITEM) } });
    await expect(
      service.submitQuote('relentless', submitDto({ services: [{ serviceCatalogItemId: 'svc-request', quantity: 500 }] })),
    ).rejects.toThrow('One of the selected services requires manual review and cannot be instantly quoted');
    expect(estimates.create).not.toHaveBeenCalled();
  });

  it('Test — a mixed cart (one instant + one request-only service) submitted to submitQuote() follows the documented policy: rejected entirely, no Estimate created at all, not even for the instant item', async () => {
    const { service, estimates } = buildService({
      serviceCatalog: {
        findOne: jest.fn((_companyId: string, id: string) => Promise.resolve(id === 'svc-instant' ? INSTANT_CATALOG_ITEM : REQUEST_CATALOG_ITEM)),
      },
    });
    await expect(
      service.submitQuote(
        'relentless',
        submitDto({
          services: [
            { serviceCatalogItemId: 'svc-instant', quantity: 500 },
            { serviceCatalogItemId: 'svc-request', quantity: 500 },
          ],
        }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(estimates.create).not.toHaveBeenCalled();
  });
});

describe('QuoteWidgetService — Request Quote (Mode B)', () => {
  it('Test — a Request-Only service does NOT create a priced Estimate', async () => {
    const { service, estimates } = buildService({ serviceCatalog: { findOne: jest.fn().mockResolvedValue(REQUEST_CATALOG_ITEM) } });
    await service.submitRequest('relentless', requestDto());
    expect(estimates.create).not.toHaveBeenCalled();
  });

  it('Test — creates the expected customer/property CRM representation, sourced correctly', async () => {
    const { service, customers } = buildService({ serviceCatalog: { findOne: jest.fn().mockResolvedValue(REQUEST_CATALOG_ITEM) } });
    await service.submitRequest('relentless', requestDto());
    expect(customers.findOrCreateByEmail).toHaveBeenCalledWith('company-1', 'Quote Widget', expect.objectContaining({ source: 'Website Quote Request', leadStatus: 'lead' }));
  });

  it('Test — creates a Customer Note that becomes the Customer Activity entry, with no authenticated staff author', async () => {
    const { service, customerNotes } = buildService({ serviceCatalog: { findOne: jest.fn().mockResolvedValue(REQUEST_CATALOG_ITEM) } });
    await service.submitRequest('relentless', requestDto());
    expect(customerNotes.create).toHaveBeenCalledTimes(1);
    const [companyIdArg, customerIdArg, authorArg, dto] = customerNotes.create.mock.calls[0];
    expect(companyIdArg).toBe('company-1');
    expect(customerIdArg).toBe('customer-1');
    expect(authorArg).toBeNull();
    expect(dto.body).toContain('Roof Cleaning');
  });

  it('Test — creates an owner notification with the correct type and related entity', async () => {
    const { service } = buildService({ serviceCatalog: { findOne: jest.fn().mockResolvedValue(REQUEST_CATALOG_ITEM) } });
    await service.submitRequest('relentless', requestDto());
    expect(mockCreateOwnerNotification).toHaveBeenCalledTimes(1);
    const [, payload] = mockCreateOwnerNotification.mock.calls[0];
    expect(payload.notificationType).toBe('website_quote_request');
    expect(payload.relatedEntityType).toBe('customer');
    expect(payload.relatedEntityId).toBe('customer-1');
  });

  it('Test — a service that does not belong to this company (or no longer exists) is rejected before any customer/note is created', async () => {
    const { service, customerNotes } = buildService({ serviceCatalog: { findOne: jest.fn().mockResolvedValue(null) } });
    await expect(service.submitRequest('relentless', requestDto())).rejects.toThrow(BadRequestException);
    expect(customerNotes.create).not.toHaveBeenCalled();
  });
});

describe('QuoteWidgetService — idempotency (backend-enforced, not frontend-trusted)', () => {
  it('Test — Instant: the same idempotency key submitted twice creates exactly one Estimate and one notification; the second call returns the cached result', async () => {
    const { service, estimates } = buildService();
    const dto = submitDto({ idempotencyKey: 'idem-key-1' });
    const first = await service.submitQuote('relentless', dto);
    const second = await service.submitQuote('relentless', dto);
    expect(estimates.create).toHaveBeenCalledTimes(1);
    expect(mockCreateOwnerNotification).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('Test — Request: the same idempotency key submitted twice creates exactly one customer note and one notification', async () => {
    const { service, customerNotes } = buildService({ serviceCatalog: { findOne: jest.fn().mockResolvedValue(REQUEST_CATALOG_ITEM) } });
    const dto = requestDto({ idempotencyKey: 'idem-key-2' });
    await service.submitRequest('relentless', dto);
    await service.submitRequest('relentless', dto);
    expect(customerNotes.create).toHaveBeenCalledTimes(1);
    expect(mockCreateOwnerNotification).toHaveBeenCalledTimes(1);
  });

  it('Test — a different idempotency key is treated as a genuinely separate submission (proves the cache is keyed correctly, not just always short-circuiting)', async () => {
    const { service, estimates } = buildService();
    await service.submitQuote('relentless', submitDto({ idempotencyKey: 'key-a' }));
    await service.submitQuote('relentless', submitDto({ idempotencyKey: 'key-b' }));
    expect(estimates.create).toHaveBeenCalledTimes(2);
  });

  it('Test — Instant and Request idempotency caches are namespaced separately (same raw key string cannot collide across the two endpoints)', async () => {
    const { service, estimates, customerNotes } = buildService({
      serviceCatalog: { findOne: jest.fn((_c: string, id: string) => Promise.resolve(id === 'svc-instant' ? INSTANT_CATALOG_ITEM : REQUEST_CATALOG_ITEM)) },
    });
    await service.submitQuote('relentless', submitDto({ idempotencyKey: 'shared-key' }));
    await service.submitRequest('relentless', requestDto({ idempotencyKey: 'shared-key' }));
    expect(estimates.create).toHaveBeenCalledTimes(1);
    expect(customerNotes.create).toHaveBeenCalledTimes(1);
  });
});

describe('QuoteWidgetService — public services projection (cross-reference)', () => {
  it('Test — getPublicServices resolves the company by slug and delegates entirely to ServiceCatalogService.findAllPublic (the dedicated restricted projection already covered by service-catalog.service.spec.ts — not re-tested here)', async () => {
    const { service, serviceCatalog, prisma } = buildService();
    await service.getPublicServices('relentless');
    expect(prisma.company.findUnique).toHaveBeenCalledWith({ where: { slug: 'relentless' } });
    expect(serviceCatalog.findAllPublic).toHaveBeenCalledWith('company-1');
  });
});
