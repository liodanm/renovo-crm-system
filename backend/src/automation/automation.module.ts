import { Module } from '@nestjs/common';
import { AutomationController } from './automation.controller';
import { AutomationService } from './services/automation.service';
import { AutomationScheduler } from './services/automation-scheduler.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [AutomationController],
  providers: [PrismaService, AutomationService, AutomationScheduler],
})
export class AutomationModule {}
