import { Module } from '@nestjs/common';
import { ReceptionistController } from './receptionist.controller';
import { TwimlBuilderService } from './services/twiml-builder.service';
import { TwilioSignatureService } from './services/twilio-signature.service';
import { BusinessHoursService } from './services/business-hours.service';
import { TwilioSmsService } from './services/twilio-sms.service';
import { CallSummaryService } from './services/call-summary.service';
import { ReceptionistToolsService } from './services/receptionist-tools.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Module({
  controllers: [ReceptionistController],
  providers: [
    PrismaService,
    TwimlBuilderService,
    TwilioSignatureService,
    BusinessHoursService,
    TwilioSmsService,
    CallSummaryService,
    ReceptionistToolsService,
  ],
  exports: [ReceptionistToolsService],
})
export class ReceptionistModule {}
