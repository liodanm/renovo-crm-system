import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './services/reports.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Module({
  controllers: [ReportsController],
  providers: [PrismaService, ReportsService],
})
export class ReportsModule {}
