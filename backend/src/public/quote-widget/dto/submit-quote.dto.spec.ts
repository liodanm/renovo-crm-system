import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SubmitQuoteDto } from './submit-quote.dto';

function baseDto(overrides: Partial<Record<string, unknown>> = {}) {
  return plainToInstance(SubmitQuoteDto, {
    firstName: 'John',
    email: 'john@example.com',
    phone: '9545551234',
    addressLine1: '123 Main St',
    city: 'Coral Springs',
    state: 'FL',
    postalCode: '33065',
    services: [{ serviceCatalogItemId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', quantity: 500 }],
    ...overrides,
  });
}

describe('SubmitQuoteDto — quantity validation (the actual security boundary for a submitted measurement)', () => {
  it('Test — a reasonable quantity passes validation', async () => {
    const errors = await validate(baseDto());
    expect(errors).toHaveLength(0);
  });

  it('Test — zero quantity is rejected', async () => {
    const dto = baseDto({ services: [{ serviceCatalogItemId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', quantity: 0 }] });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('Test — negative quantity is rejected', async () => {
    const dto = baseDto({ services: [{ serviceCatalogItemId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', quantity: -500 }] });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('Test — an implausibly large quantity (e.g. a fabricated 50,000 sq ft driveway) is rejected', async () => {
    const dto = baseDto({ services: [{ serviceCatalogItemId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', quantity: 50_000 }] });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('Test — a quantity right at the boundary (20,000) is accepted, confirming the limit is inclusive and not accidentally off-by-one restrictive', async () => {
    const dto = baseDto({ services: [{ serviceCatalogItemId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', quantity: 20_000 }] });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('Test — a non-finite quantity (NaN) is rejected', async () => {
    const dto = baseDto({ services: [{ serviceCatalogItemId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', quantity: NaN }] });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
