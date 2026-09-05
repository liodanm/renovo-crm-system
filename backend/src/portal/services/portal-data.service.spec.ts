import { ForbiddenException } from '@nestjs/common';
import { PortalDataService } from './portal-data.service';

/**
 * Scoped specifically to the new Job Before/After photo portal
 * endpoints — this is the highest-priority security surface in this
 * feature (a customer session reading another customer's, or another
 * company's, photos would be a real data breach). Not a full spec for
 * every method on PortalDataService.
 *
 * Same honest limitation as every other spec in this codebase: mocks
 * Prisma entirely, no real database connection available in this
 * environment — these prove the AUTHORIZATION LOGIC is correct (the
 * job-ownership check runs before any photo data is returned, and
 * really does scope by companyId+customerId, not just jobId alone),
 * not that Postgres RLS itself blocks a bypass attempt. That would
 * need a live database test, same gap noted for the transaction-
 * rollback tests earlier in this project.
 */
function buildService(overrides: Record<string, any> = {}) {
  const prisma = {
    withTenantContext: jest.fn((_companyId: string, fn: (tx: any) => any) => fn(prisma)),
    job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1' }) },
    ...overrides.prisma,
  };
  const jobPhotos = {
    listByJob: jest.fn().mockResolvedValue([
      { id: 'photo-1', photoType: 'before' },
      { id: 'photo-2', photoType: 'after' },
      { id: 'photo-3', photoType: 'damage' },
    ]),
    getFile: jest.fn().mockResolvedValue({ buffer: Buffer.from('fake-image'), mimeType: 'image/jpeg' }),
    ...overrides.jobPhotos,
  };
  const photoStorage = {
    read: jest.fn().mockResolvedValue(Buffer.from('fake-web-derivative')),
    save: jest.fn().mockResolvedValue(undefined),
    buildVariantKeys: jest.fn().mockReturnValue({ original: 'orig-key', web: 'web-key', thumbnail: 'thumb-key' }),
    ...overrides.photoStorage,
  };

  const service = new PortalDataService(
    prisma as any,
    {} as any, // storage
    {} as any, // jobsService
    {} as any, // customersService
    {} as any, // companyContext
    {} as any, // mailService
    {} as any, // config
    jobPhotos as any,
    photoStorage as any,
  );

  return { service, prisma, jobPhotos, photoStorage };
}

describe('PortalDataService — Job photos authorization', () => {
  it('Test — getJobPhotosForCustomer verifies job ownership BEFORE returning any photo data, scoped by company AND customer, not jobId alone', async () => {
    const { service, prisma } = buildService();
    await service.getJobPhotosForCustomer('company-1', 'customer-1', 'job-1');
    expect(prisma.job.findFirst).toHaveBeenCalledWith({
      where: { id: 'job-1', companyId: 'company-1', customerId: 'customer-1' },
      select: { id: true },
    });
  });

  it('Test — a job that exists but belongs to a DIFFERENT customer (or company) is rejected — the ownership query itself returning nothing is what blocks it, not a separate check', async () => {
    const { service, jobPhotos } = buildService({ prisma: { job: { findFirst: jest.fn().mockResolvedValue(null) } } });
    await expect(service.getJobPhotosForCustomer('company-1', 'customer-1', 'someone-elses-job')).rejects.toThrow(ForbiddenException);
    // The real proof: photo data was never even queried once authorization failed.
    expect(jobPhotos.listByJob).not.toHaveBeenCalled();
  });

  it('Test — only before/after photos are ever returned to a customer — during/damage/equipment/other stay internal even though they exist on the same job', async () => {
    const { service } = buildService();
    const result = await service.getJobPhotosForCustomer('company-1', 'customer-1', 'job-1');
    expect(result).toEqual([
      { id: 'photo-1', photoType: 'before' },
      { id: 'photo-2', photoType: 'after' },
    ]);
    expect(result.find((p) => p.photoType === 'damage')).toBeUndefined();
  });

  it('Test — getJobPhotoFileForCustomer also runs the same ownership check before touching file storage — an authorized-looking jobId with a photoId from a different job still goes through JobPhotosService.getFile\'s own jobId+companyId scoping', async () => {
    const { service, prisma, jobPhotos } = buildService();
    await service.getJobPhotoFileForCustomer('company-1', 'customer-1', 'job-1', 'photo-1');
    expect(prisma.job.findFirst).toHaveBeenCalledWith({
      where: { id: 'job-1', companyId: 'company-1', customerId: 'customer-1' },
      select: { id: true },
    });
    // 'web' explicit — see getJobPhotoFileForCustomer's own comment:
    // this method was hardened during the S3 migration pass to always
    // pass the variant explicitly rather than rely on getFile()'s
    // default, specifically because this is the security-critical
    // customer-facing path. This assertion has to match that real
    // change; it was stale (still expecting 3 args) until this fix.
    expect(jobPhotos.getFile).toHaveBeenCalledWith('company-1', 'job-1', 'photo-1', 'web');
  });

  it('Test — getJobPhotoFileForCustomer rejects before ever calling storage when the job ownership check fails', async () => {
    const { service, jobPhotos } = buildService({ prisma: { job: { findFirst: jest.fn().mockResolvedValue(null) } } });
    await expect(service.getJobPhotoFileForCustomer('company-1', 'customer-1', 'job-1', 'photo-1')).rejects.toThrow(ForbiddenException);
    expect(jobPhotos.getFile).not.toHaveBeenCalled();
  });
});
