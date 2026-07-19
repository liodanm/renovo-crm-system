import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailService } from './mail.service';
import { MailProcessor } from './mail.processor';
import { PrismaService } from '../common/prisma/prisma.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'mail' })],
  providers: [MailService, MailProcessor, PrismaService],
  exports: [MailService],
})
export class MailModule {}
