import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { MailModule } from '../mail/mail.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [MailModule, CustomersModule],
  controllers: [LeadsController],
  providers: [PrismaService, LeadsService],
})
export class LeadsModule {}
