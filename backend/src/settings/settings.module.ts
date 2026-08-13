import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './services/settings.service';
import { IntegrationsService } from './services/integrations.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { PasswordService } from '../auth/services/password.service';
import { MailModule } from '../mail/mail.module';
import { HealthModule } from '../health/health.module';
import { StorageService } from '../common/storage/storage.service';
import { AiSuggestionsService } from '../ai/ai-suggestions.service';
import { StripePaymentService } from '../portal/services/stripe-payment.service';
// IntegrationsModule (common/integrations) and SmsModule are both
// @Global() — registered once in AppModule, available here without a
// redundant import. StorageService/AiSuggestionsService/StripePaymentService
// have no module of their own — every consumer (jobs, portal, dashboard,
// customers) provides them directly, same pattern followed here rather
// than inventing a shared module for this pass.
@Module({
  imports: [MailModule, HealthModule],
  controllers: [SettingsController],
  providers: [PrismaService, SettingsService, PasswordService, IntegrationsService, StorageService, AiSuggestionsService, StripePaymentService],
  exports: [IntegrationsService],
})
export class SettingsModule {}
