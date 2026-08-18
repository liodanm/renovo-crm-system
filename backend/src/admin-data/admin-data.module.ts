import { Module } from '@nestjs/common';
import { AdminDataController } from './admin-data.controller';
import { AdminDataService } from './admin-data.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Module({
  controllers: [AdminDataController],
  providers: [PrismaService, AdminDataService],
})
export class AdminDataModule {}
