import { Module } from '@nestjs/common';
import { EstimatesController } from './estimates.controller';
import { EstimatesService } from './services/estimates.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule], // for convertToJob -> JobsService.createFromEstimate
  controllers: [EstimatesController],
  providers: [PrismaService, EstimatesService],
})
export class EstimatesModule {}
