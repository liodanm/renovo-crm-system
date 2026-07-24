import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PortalController } from './portal.controller';
import { PortalAuthService } from './services/portal-auth.service';
import { PortalDataService } from './services/portal-data.service';
import { StripePaymentService } from './services/stripe-payment.service';
import { PortalChatService } from './services/portal-chat.service';
import { PortalCustomerGuard } from './guards/portal-customer.guard';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { PasswordService } from '../auth/services/password.service';
import { MailModule } from '../mail/mail.module';
import { DocumentsModule } from '../documents/documents.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    JwtModule.register({}), // secret passed per-call (PORTAL_JWT_SECRET), same pattern as the staff AuthModule
    MailModule,
    DocumentsModule,
    JobsModule, // automatic Job creation on estimate acceptance — see PortalDataService.approveEstimate
  ],
  controllers: [PortalController],
  providers: [
    PrismaService,
    StorageService,
    PasswordService,
    PortalAuthService,
    PortalDataService,
    StripePaymentService,
    PortalChatService,
    PortalCustomerGuard,
  ],
  exports: [PortalAuthService],
})
export class PortalModule {}
