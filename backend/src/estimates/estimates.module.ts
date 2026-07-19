import { Module } from '@nestjs/common';
import { EstimatesController } from './estimates.controller';
import { EstimatesService } from './services/estimates.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { JobsModule } from '../jobs/jobs.module';
import { DocumentsModule } from '../documents/documents.module';
import { MailModule } from '../mail/mail.module';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [JobsModule, DocumentsModule, MailModule, AutomationModule], // JobsModule: convertToJob -> JobsService.createFromEstimate; DocumentsModule: PDF + email logging; MailModule: real send; AutomationModule: event logging
  controllers: [EstimatesController],
  providers: [PrismaService, EstimatesService],
})
export class EstimatesModule {}
