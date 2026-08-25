import { Module } from '@nestjs/common';
import { EstimatesController } from './estimates.controller';
import { EstimatesService } from './services/estimates.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { JobsModule } from '../jobs/jobs.module';
import { DocumentsModule } from '../documents/documents.module';
import { MailModule } from '../mail/mail.module';
import { CustomersModule } from '../customers/customers.module';
import { PortalModule } from '../portal/portal.module';
import { SmsModule } from '../sms/sms.module';
import { StorageService } from '../common/storage/storage.service';

@Module({
  imports: [JobsModule, DocumentsModule, MailModule, CustomersModule, PortalModule, SmsModule], // JobsModule: convertToJob -> JobsService.createFromEstimate; DocumentsModule: PDF + email logging; MailModule: real send; CustomersModule: the shared lead->active auto-transition on acceptance; PortalModule: PortalAuthService, for the authenticated portal link in send emails; SmsModule: the same real Twilio-calling SmsService automation reminders already use, for sendSms().
  controllers: [EstimatesController],
  providers: [PrismaService, EstimatesService, StorageService], // StorageService: same per-module local-provider convention customers.module.ts/jobs.module.ts already use, not a shared StorageModule — for the S3-backed acceptance signature (getSignature()).
  exports: [EstimatesService], // AutomationService.runEstimateExpiration reuses markExpired directly rather than a second implementation
})
export class EstimatesModule {}
