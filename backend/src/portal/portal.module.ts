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
import { PhotoStorageService } from '../jobs/services/photo-storage.service';
import { PasswordService } from '../auth/services/password.service';
import { MailModule } from '../mail/mail.module';
import { DocumentsModule } from '../documents/documents.module';
import { JobsModule } from '../jobs/jobs.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [
    JwtModule.register({}), // secret passed per-call (PORTAL_JWT_SECRET), same pattern as the staff AuthModule
    MailModule,
    DocumentsModule,
    JobsModule, // automatic Job creation on estimate acceptance — see PortalDataService.approveEstimate
    CustomersModule, // the shared lead->active auto-transition, same method EstimatesService.acceptManually calls
  ],
  controllers: [PortalController],
  providers: [
    PrismaService,
    StorageService,
    // Listed directly here (same convention already used for StorageService
    // across multiple modules in this app) rather than exported from
    // JobsModule — for the new Account → Photos feature: reads a
    // customer-profile photo's original (already uploaded via the
    // existing, unmodified CustomerFilesService/photos-tab.tsx staff
    // flow) and generates a safe, EXIF-stripped web derivative on
    // first portal view. See PortalDataService.getCustomerProfilePhotoFileForPortal.
    PhotoStorageService,
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
