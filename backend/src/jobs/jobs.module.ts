import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './services/jobs.service';
import { JobFieldOpsService } from './services/job-field-ops.service';
import { JobPhotosService } from './services/job-photos.service';
import { PhotoStorageService } from './services/photo-storage.service';
import { JobCallbacksService } from './services/job-callbacks.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Module({
  controllers: [JobsController],
  providers: [PrismaService, JobsService, JobFieldOpsService, JobPhotosService, PhotoStorageService, JobCallbacksService],
  exports: [JobsService, JobCallbacksService], // EstimatesModule imports JobsService to call createFromEstimate; JobCallbacksService exported for the future Reports module wiring (getCallbackRate)
})
export class JobsModule {}
