import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './services/invoices.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { DocumentsModule } from '../documents/documents.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [DocumentsModule, MailModule],
  controllers: [InvoicesController],
  providers: [PrismaService, InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
