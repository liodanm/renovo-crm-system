import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './services/jobs.service';
import { JobFieldOpsService } from './services/job-field-ops.service';
import { JobPhotosService } from './services/job-photos.service';
import { PhotoStorageService } from './services/photo-storage.service';
import { JobCallbacksService } from './services/job-callbacks.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';

@Module({
  controllers: [JobsController],
  // StorageService added — PhotoStorageService now delegates to it for
  // real S3 persistence (see photo-storage.service.ts's own doc
  // comment) instead of writing to local disk.
  providers: [PrismaService, JobsService, JobFieldOpsService, JobPhotosService, PhotoStorageService, JobCallbacksService, StorageService],
  exports: [JobsService, JobCallbacksService, JobPhotosService], // EstimatesModule imports JobsService to call createFromEstimate; JobCallbacksService exported for the future Reports module wiring (getCallbackRate); JobPhotosService exported for PortalModule's read-only customer photo gallery (see PortalDataService.getJobPhotosForCustomer)
})
export class JobsModule {}
