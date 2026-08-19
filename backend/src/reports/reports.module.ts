import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './services/reports.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule], // for JobCallbacksService.getCallbackRate — the Owner Scorecard's Callback Rate KPI reuses it directly rather than a second implementation of the same query
  controllers: [ReportsController],
  providers: [PrismaService, ReportsService],
})
export class ReportsModule {}
