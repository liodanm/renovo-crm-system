import { Module } from '@nestjs/common';
import { PdfService } from './services/pdf.service';
import { EmailLogService } from './services/email-log.service';
import { CompanyContextService } from './services/company-context.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Module({
  providers: [PdfService, EmailLogService, CompanyContextService, PrismaService],
  exports: [PdfService, EmailLogService, CompanyContextService],
})
export class DocumentsModule {}
