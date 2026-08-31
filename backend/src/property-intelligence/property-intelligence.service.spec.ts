import { PropertyIntelligenceService } from './property-intelligence.service';

const realFetch = global.fetch;

function buildService(redisOverrides: Partial<Record<string, jest.Mock>> = {}) {
  const store = new Map<string, string>();
  const redis = {
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    ...redisOverrides,
  };
  return { service: new PropertyIntelligenceService(redis as any), redis, store };
}

// A real, roughly-known building shape — a simple rectangle near
// Coral Springs, FL, sized so the expected area is easy to hand-verify
// independently of the code under test: ~40m × 20m ≈ 800 sq meters ≈
// 8,611 sq ft, well inside the plausible-house sanity range.
const RECT_GEOMETRY = [
  { lat: 26.2712, lon: -80.2706 },
  { lat: 26.2712, lon: -80.27042 }, // ~20m east at this latitude
  { lat: 26.27156, lon: -80.27042 }, // ~40m north
  { lat: 26.27156, lon: -80.2706 },
];

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe('PropertyIntelligenceService — geometry correctness', () => {
  it('Test — computes a plausible area for a real rectangular footprint, proving the local-projection approach (not raw shoelace-on-degrees) is actually being used', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ elements: [{ geometry: RECT_GEOMETRY }] }),
    }) as any;
    const { service } = buildService();

    const result = await service.lookupBuildingFootprint(26.2714, -80.2705);

    // Raw shoelace on degrees (the explicitly-warned-against wrong
    // approach) would produce a wildly different, geographically
    // meaningless number here — this asserts the actual, sane result a
    // correct meter-projection produces for this real building size.
    expect(result.confidence).toBe('medium');
    expect(result.areaSqFt).toBeGreaterThan(7000);
    expect(result.areaSqFt).toBeLessThan(10000);
  });

  it('Test — Overpass query includes a bounding box around the given coordinates', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) });
    global.fetch = fetchMock as any;
    const { service } = buildService();

    await service.lookupBuildingFootprint(26.2714, -80.2705);

    // A small bounding-box delta is applied around the input
    // coordinates (see the service's own comment on why), so the exact
    // literal input never appears verbatim — asserting the shared
    // prefix proves the real coordinates were actually incorporated
    // without being brittle to that delta's exact value.
    const [, options] = fetchMock.mock.calls[0];
    expect(decodeURIComponent(options.body)).toContain('26.27');
    expect(decodeURIComponent(options.body)).toContain('-80.27');
  });
});

describe('PropertyIntelligenceService — graceful failure (must never break the Quote Tool)', () => {
  it('Test — no building found returns unavailable, not an error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) }) as any;
    const { service } = buildService();
    const result = await service.lookupBuildingFootprint(26.2714, -80.2705);
    expect(result.confidence).toBe('unavailable');
    expect(result.areaSqFt).toBe(0);
  });

  it('Test — Overpass HTTP error returns unavailable, not a thrown exception', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 504 }) as any;
    const { service } = buildService();
    await expect(service.lookupBuildingFootprint(26.2714, -80.2705)).resolves.toEqual(
      expect.objectContaining({ confidence: 'unavailable' }),
    );
  });

  it('Test — network failure (timeout, DNS, etc.) returns unavailable, not a thrown exception', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed')) as any;
    const { service } = buildService();
    await expect(service.lookupBuildingFootprint(26.2714, -80.2705)).resolves.toEqual(
      expect.objectContaining({ confidence: 'unavailable' }),
    );
  });

  it('Test — an implausibly tiny polygon (sliver/bad data) is rejected as unavailable rather than shown as a real measurement', async () => {
    const tinySliver = [
      { lat: 26.2714, lon: -80.2705 },
      { lat: 26.2714, lon: -80.270501 },
      { lat: 26.271401, lon: -80.270501 },
      { lat: 26.271401, lon: -80.2705 },
    ];
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: [{ geometry: tinySliver }] }) }) as any;
    const { service } = buildService();
    const result = await service.lookupBuildingFootprint(26.2714, -80.2705);
    expect(result.confidence).toBe('unavailable');
  });

  it('Test — multiple buildings in range picks the largest and marks confidence low (never guesses which is "the house" with certainty)', async () => {
    const shed = [
      { lat: 26.2712, lon: -80.2706 }, { lat: 26.2712, lon: -80.27058 },
      { lat: 26.27122, lon: -80.27058 }, { lat: 26.27122, lon: -80.2706 },
    ];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ elements: [{ geometry: shed }, { geometry: RECT_GEOMETRY }] }),
    }) as any;
    const { service } = buildService();
    const result = await service.lookupBuildingFootprint(26.2714, -80.2705);
    expect(result.confidence).toBe('low');
    expect(result.areaSqFt).toBeGreaterThan(7000); // picked the house-sized rectangle, not the shed
  });
});

describe('PropertyIntelligenceService — caching', () => {
  it('Test — a found footprint is cached with no expiry (permanent, matching GeocodingService\'s own reasoning)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: [{ geometry: RECT_GEOMETRY }] }) }) as any;
    const { service, redis } = buildService();
    await service.lookupBuildingFootprint(26.2714, -80.2705);
    expect(redis.set).toHaveBeenCalledWith(expect.any(String), expect.any(String)); // no 'EX' arg — permanent
  });

  it('Test — an unavailable result IS cached, but with a bounded TTL, not permanently', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) }) as any;
    const { service, redis } = buildService();
    await service.lookupBuildingFootprint(26.2714, -80.2705);
    expect(redis.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'EX', expect.any(Number));
  });

  it('Test — a second lookup at the same coordinates uses the cache, not a second Overpass call', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: [{ geometry: RECT_GEOMETRY }] }) });
    global.fetch = fetchMock as any;
    const { service } = buildService();
    await service.lookupBuildingFootprint(26.2714, -80.2705);
    await service.lookupBuildingFootprint(26.2714, -80.2705);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
