import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './services/invoices.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Module({
  controllers: [InvoicesController],
  providers: [PrismaService, InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
