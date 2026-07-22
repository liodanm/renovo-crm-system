import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from '../common/prisma/prisma.service';
import { SystemHealthService } from './system-health.service';

@Module({
  controllers: [HealthController],
  providers: [PrismaService, SystemHealthService],
  exports: [SystemHealthService],
})
export class HealthModule {}
