import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './services/settings.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { PasswordService } from '../auth/services/password.service';
import { MailModule } from '../mail/mail.module';
// IntegrationsModule and SmsModule are both @Global() — registered once
// in AppModule, available here without a redundant import.

@Module({
  imports: [MailModule],
  controllers: [SettingsController],
  providers: [PrismaService, SettingsService, PasswordService],
})
export class SettingsModule {}
