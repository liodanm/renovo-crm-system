import { Module } from '@nestjs/common';
import { SecurityEventsController } from './security-events.controller';
import { SecurityEventsService } from './services/security-events.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Module({
  controllers: [SecurityEventsController],
  providers: [PrismaService, SecurityEventsService],
  exports: [SecurityEventsService], // AuthModule imports this to record login/registration/invite events
})
export class SecurityEventsModule {}
