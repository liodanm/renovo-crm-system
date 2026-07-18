import { Module } from '@nestjs/common';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './services/scheduling.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Module({
  controllers: [SchedulingController],
  providers: [PrismaService, SchedulingService],
  exports: [SchedulingService],
})
export class SchedulingModule {}
