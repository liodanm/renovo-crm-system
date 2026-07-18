import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './services/payments.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Module({
  controllers: [PaymentsController],
  providers: [PrismaService, PaymentsService],
})
export class PaymentsModule {}
