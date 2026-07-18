import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './services/settings.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { PasswordService } from '../auth/services/password.service';

@Module({
  controllers: [SettingsController],
  providers: [PrismaService, SettingsService, PasswordService],
})
export class SettingsModule {}
