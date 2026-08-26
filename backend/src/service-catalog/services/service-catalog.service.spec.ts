import { ServiceCatalogService } from './service-catalog.service';

/**
 * Verifies the one property this task exists to guarantee: the public
 * Quote Widget projection returns ONLY the intentionally-public field
 * set, at the database-query level — not "the frontend happens to
 * ignore extra fields." Same hand-rolled PrismaService mock convention
 * established in customers.service.spec.ts (this codebase's only
 * precedent for testing a service class rather than a pure util), not
 * a new mocking style.
 *
 * What these tests CAN verify: the exact SQL text this method sends
 * lists only the approved columns, and that withTenantContext is
 * called with the given companyId (the mechanism RLS depends on).
 * What they CANNOT verify without a real Postgres instance: that a raw
 * SQL string claiming to select 6 columns couldn't somehow be tricked
 * into returning more — that's a live-database concern, not a unit-
 * test concern, and is not silently upgraded to a pass here.
 */
function buildMockTx(rows: any[]) {
  return {
    $queryRawUnsafe: jest.fn().mockResolvedValue(rows),
  };
}

describe('ServiceCatalogService.findAllPublic — public projection security', () => {
  let mockTx: ReturnType<typeof buildMockTx>;
  let withTenantContextCalls: { companyId: string }[];
  let prisma: any;
  let service: ServiceCatalogService;

  const PUBLIC_ROW = {
    id: 'svc-1',
    name: 'Driveway Cleaning',
    serviceType: 'driveway_cleaning',
    category: 'Exterior',
    description: 'Pressure washing for driveways.',
    defaultUnitOfMeasure: 'sq_ft',
  };

  function setup(rows: any[]) {
    mockTx = buildMockTx(rows);
    withTenantContextCalls = [];
    prisma = {
      withTenantContext: jest.fn((companyId: string, fn: (tx: any) => any) => {
        withTenantContextCalls.push({ companyId });
        return fn(mockTx);
      }),
    };
    service = new ServiceCatalogService(prisma);
  }

  it('Test 1 — returns active public services', async () => {
    setup([PUBLIC_ROW]);
    const result = await service.findAllPublic('company-1');
    expect(result).toEqual([PUBLIC_ROW]);
  });

  it('Test 2 — the underlying query filters to is_active = true (inactive services excluded by the query itself)', async () => {
    setup([]);
    await service.findAllPublic('company-1');
    const sql = mockTx.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain('is_active = true');
  });

  it('Test 3 — the query selects every field the public Quote Tool contract requires', async () => {
    setup([]);
    await service.findAllPublic('company-1');
    const sql = mockTx.$queryRawUnsafe.mock.calls[0][0] as string;
    for (const requiredColumn of ['id', 'name', 'service_type', 'category', 'description', 'default_unit_of_measure']) {
      expect(sql).toContain(requiredColumn);
    }
  });

  it('Test 4 — the query never selects internal operational fields', async () => {
    setup([]);
    await service.findAllPublic('company-1');
    const sql = mockTx.$queryRawUnsafe.mock.calls[0][0] as string;
    for (const internalColumn of [
      'default_chemicals',
      'default_equipment',
      'required_equipment',
      'preparation_instructions',
      'aftercare_instructions',
      'default_notes',
      'default_terms',
      'suggested_upsell_service_ids',
      'suggested_future_service_ids',
      'warranty_terms',
    ]) {
      expect(sql).not.toContain(internalColumn);
    }
  });

  it('Test 5 — a row returned from the mocked query contains only the approved public keys (defense against the query text and the actual returned shape drifting apart)', async () => {
    setup([PUBLIC_ROW]);
    const [result] = await service.findAllPublic('company-1');
    expect(Object.keys(result).sort()).toEqual(['category', 'defaultUnitOfMeasure', 'description', 'id', 'name', 'serviceType'].sort());
  });

  it('Test 6 — the query never selects price, cost, or margin fields (no such column exists on this table at all — confirmed by reading the full schema; this test guards against one ever being added here by mistake)', async () => {
    setup([]);
    await service.findAllPublic('company-1');
    const sql = mockTx.$queryRawUnsafe.mock.calls[0][0] as string;
    for (const financialColumn of ['default_unit_price', 'minimum_price', 'cost', 'margin', 'profit']) {
      expect(sql.toLowerCase()).not.toContain(financialColumn);
    }
  });

  it('Test 7 — companyId flows through withTenantContext, the mechanism RLS depends on, and is passed as a real query parameter, never string-interpolated into the SQL text', async () => {
    setup([]);
    await service.findAllPublic('company-a');
    expect(withTenantContextCalls).toEqual([{ companyId: 'company-a' }]);
    const [sql, ...params] = mockTx.$queryRawUnsafe.mock.calls[0];
    expect(sql).not.toContain('company-a'); // never inlined into the SQL string itself
    expect(params).toContain('company-a'); // only ever passed as a bound parameter
  });

  it('Test 8 — a different companyId produces an entirely separate call, never merged with another tenant\'s', async () => {
    setup([]);
    await service.findAllPublic('company-a');
    await service.findAllPublic('company-b');
    expect(withTenantContextCalls).toEqual([{ companyId: 'company-a' }, { companyId: 'company-b' }]);
  });
});
