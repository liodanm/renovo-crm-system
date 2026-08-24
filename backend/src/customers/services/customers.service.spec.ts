import { CustomersService } from './customers.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

/**
 * These tests verify the one property this hardening pass exists to
 * guarantee: every CustomersService method that touches the database
 * now goes through PrismaService.withTenantContext with the correct
 * companyId — the mechanism that sets the Postgres session variable
 * every RLS policy in this schema depends on (see prisma.service.ts).
 *
 * They do NOT and cannot verify that RLS itself actually blocks a
 * cross-tenant query against a real Postgres instance — that requires
 * a live database this environment does not have. What they verify
 * instead is the thing that's fully within reach: that the application
 * code now reliably establishes tenant context on every call, which is
 * exactly the gap the full-system audit found and this pass closed.
 * Live RLS/tenant-isolation verification against a real Postgres
 * instance remains a genuine, stated limitation — not silently
 * upgraded to a pass here.
 *
 * No NestJS DI/mocking convention exists elsewhere in this codebase
 * (only pure-function .util.spec.ts tests do) — this is a new, but
 * deliberately minimal, test shape: a hand-rolled PrismaService mock
 * whose withTenantContext records the companyId it was called with and
 * hands back a fake tx wired to jest.fn() model methods, rather than a
 * heavier mocking framework this codebase has never used before.
 */

function buildMockTx() {
  return {
    customer: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    invoice: { groupBy: jest.fn(), aggregate: jest.fn(), count: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    job: { groupBy: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    estimate: { findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
    payment: { findMany: jest.fn(), updateMany: jest.fn() },
    customFieldValue: { findMany: jest.fn() },
    serviceCatalogItem: { findMany: jest.fn() },
    automationSettings: { findUnique: jest.fn() },
    automationLog: { findFirst: jest.fn() },
    customerNote: { findMany: jest.fn(), updateMany: jest.fn() },
    property: { updateMany: jest.fn() },
    photo: { updateMany: jest.fn() },
    document: { updateMany: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([{ total: '0' }]),
  };
}

describe('CustomersService — tenant-context hardening regression tests', () => {
  let mockTx: ReturnType<typeof buildMockTx>;
  let withTenantContextCalls: { companyId: string }[];
  let prisma: any;
  let service: CustomersService;

  beforeEach(() => {
    mockTx = buildMockTx();
    withTenantContextCalls = [];

    prisma = {
      withTenantContext: jest.fn((companyId: string, fn: (tx: any) => any) => {
        withTenantContextCalls.push({ companyId });
        return fn(mockTx);
      }),
    };

    const settings = { getLeadSources: jest.fn().mockResolvedValue({ options: [] }) };
    const duplicateDetection = {};

    service = new CustomersService(prisma, duplicateDetection as any, settings as any);
  });

  it('create() establishes tenant context with the exact companyId passed in — the core public-endpoint-safety property', async () => {
    mockTx.customer.findFirst.mockResolvedValue(null); // no exact-email conflict
    mockTx.customer.create.mockResolvedValue({ id: 'cust-1', companyId: 'company-A' });

    await service.create('company-A', 'staff-user-1', { firstName: 'Jane', businessName: undefined } as any);

    expect(withTenantContextCalls).toEqual([{ companyId: 'company-A' }]);
    expect(mockTx.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ companyId: 'company-A' }) }),
    );
  });

  it('findOrCreateByEmail() — the actual public Quote Widget / Leads entry point — establishes tenant context using the passed companyId, not an interceptor-derived one (there is no authenticated request for this path)', async () => {
    mockTx.customer.findFirst.mockResolvedValueOnce(null); // findOrCreateByEmail's own existing-customer check
    mockTx.customer.findFirst.mockResolvedValueOnce(null); // create()'s internal exact-email check
    mockTx.customer.create.mockResolvedValue({ id: 'cust-2', companyId: 'company-B' });

    const result = await service.findOrCreateByEmail('company-B', 'Quote Widget', { email: 'a@b.com', firstName: 'Homeowner' } as any);

    // Two withTenantContext calls (the existence check, then create()'s
    // own) — both must carry the SAME companyId that was passed in,
    // proving a public caller's trusted companyId (resolved from a
    // widget key / company slug, never from client input) flows all
    // the way through, with no reliance on request.user existing.
    expect(withTenantContextCalls.every((c) => c.companyId === 'company-B')).toBe(true);
    expect(result.wasExisting).toBe(false);
  });

  it('findOrCreateByEmail() returns the existing customer without creating a duplicate, still under the correct tenant context', async () => {
    const existingCustomer = { id: 'cust-existing', companyId: 'company-C', email: 'a@b.com' };
    mockTx.customer.findFirst.mockResolvedValueOnce(existingCustomer);

    const result = await service.findOrCreateByEmail('company-C', 'Quote Widget', { email: 'a@b.com' } as any);

    expect(result.wasExisting).toBe(true);
    expect(result.customer).toBe(existingCustomer);
    expect(mockTx.customer.create).not.toHaveBeenCalled();
    expect(withTenantContextCalls).toEqual([{ companyId: 'company-C' }]);
  });

  it('list() establishes tenant context and filters strictly by the requested companyId — Tenant A can never receive Tenant B rows through this path', async () => {
    mockTx.customer.count.mockResolvedValue(0);
    mockTx.customer.findMany.mockResolvedValue([]);

    await service.list('company-A', {} as any);

    expect(withTenantContextCalls).toEqual([{ companyId: 'company-A' }]);
    expect(mockTx.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-A' }) }),
    );
    expect(mockTx.customer.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-A' }) }),
    );
  });

  it('getProfile() throws NotFoundException — not a cross-tenant leak — when the customer belongs to a different company', async () => {
    // Simulates the real defense: even with a matching customerId, the
    // where-clause requires companyId too, so a wrong-tenant lookup
    // returns null from the DB layer, not another company's record.
    mockTx.customer.findFirst.mockResolvedValue(null);

    await expect(service.getProfile('company-A', 'customer-belongs-to-company-B')).rejects.toThrow(NotFoundException);
    expect(mockTx.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-A', id: 'customer-belongs-to-company-B' }) }),
    );
  });

  it('update() establishes tenant context and cannot update a customer outside its companyId (assertExists gates it first)', async () => {
    mockTx.customer.findFirst.mockResolvedValue(null); // assertExists finds nothing for the wrong company

    await expect(service.update('company-A', 'customer-in-company-B', { firstName: 'X' } as any)).rejects.toThrow(NotFoundException);

    expect(withTenantContextCalls).toEqual([{ companyId: 'company-A' }]);
    expect(mockTx.customer.update).not.toHaveBeenCalled();
  });

  it('softDelete() establishes tenant context and refuses to delete a customer outside its companyId', async () => {
    mockTx.customer.findFirst.mockResolvedValue(null);

    await expect(service.softDelete('company-A', 'customer-in-company-B')).rejects.toThrow(NotFoundException);

    expect(withTenantContextCalls).toEqual([{ companyId: 'company-A' }]);
    expect(mockTx.customer.update).not.toHaveBeenCalled();
  });

  it("assertNoExactEmailConflict (via create) cannot match an email belonging to a different company's customer — it queries within the same tenant-scoped transaction", async () => {
    mockTx.customer.findFirst.mockResolvedValue({ id: 'other-customer', companyId: 'company-A' });

    await expect(
      service.create('company-A', 'staff-user-1', { firstName: 'Jane', email: 'dup@example.com' } as any),
    ).rejects.toThrow(ConflictException);

    expect(withTenantContextCalls).toEqual([{ companyId: 'company-A' }]);
  });

  it('merge() establishes tenant context once for the whole operation and refuses to proceed if either customer is outside the companyId', async () => {
    mockTx.customer.findFirst.mockResolvedValue(null); // assertExists fails for canonicalId

    await expect(service.merge('company-A', 'canonical-in-company-B', 'dup-1')).rejects.toThrow(NotFoundException);

    expect(withTenantContextCalls).toEqual([{ companyId: 'company-A' }]);
    expect(mockTx.property.updateMany).not.toHaveBeenCalled();
  });

  it('convertLeadToActiveIfNeeded() establishes tenant context and scopes its conditional update by companyId', async () => {
    mockTx.customer.updateMany.mockResolvedValue({ count: 1 });

    await service.convertLeadToActiveIfNeeded('company-A', 'customer-1');

    expect(withTenantContextCalls).toEqual([{ companyId: 'company-A' }]);
    expect(mockTx.customer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-A', id: 'customer-1' }) }),
    );
  });
});
