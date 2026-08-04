import { Module } from '@nestjs/common';
import { EstimatesController } from './estimates.controller';
import { EstimatesService } from './services/estimates.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { JobsModule } from '../jobs/jobs.module';
import { DocumentsModule } from '../documents/documents.module';
import { MailModule } from '../mail/mail.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [JobsModule, DocumentsModule, MailModule, CustomersModule], // JobsModule: convertToJob -> JobsService.createFromEstimate; DocumentsModule: PDF + email logging; MailModule: real send; CustomersModule: the shared lead->active auto-transition on acceptance. Automation event logging goes through the standalone logAutomationEvent utility, no module import needed.
  controllers: [EstimatesController],
  providers: [PrismaService, EstimatesService],
  exports: [EstimatesService], // AutomationService.runEstimateExpiration reuses markExpired directly rather than a second implementation
})
export class EstimatesModule {}
