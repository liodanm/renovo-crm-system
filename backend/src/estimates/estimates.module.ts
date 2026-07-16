import { Module } from '@nestjs/common';
import { EstimatesController } from './estimates.controller';
import { EstimatesService } from './services/estimates.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Module({
  controllers: [EstimatesController],
  providers: [PrismaService, EstimatesService],
})
export class EstimatesModule {}
