import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './services/jobs.service';
import { JobFieldOpsService } from './services/job-field-ops.service';
import { JobPhotosService } from './services/job-photos.service';
import { PhotoStorageService } from './services/photo-storage.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Module({
  controllers: [JobsController],
  providers: [PrismaService, JobsService, JobFieldOpsService, JobPhotosService, PhotoStorageService],
  exports: [JobsService], // EstimatesModule imports this to call createFromEstimate
})
export class JobsModule {}
