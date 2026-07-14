import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import authConfig from './config/auth.config';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CustomersModule } from './customers/customers.module';
import { ReceptionistModule } from './receptionist/receptionist.module';
import { PortalModule } from './portal/portal.module';
import { HealthModule } from './health/health.module';
import { AutomationModule } from './automation/automation.module';
import { LeadsModule } from './leads/leads.module';
import { LoggingModule } from './common/logging/logging.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    LoggingModule, // registered first — every other module's logger calls should already be structured
    ConfigModule.forRoot({ isGlobal: true, load: [authConfig] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), // global baseline; auth endpoints add their own tighter limits
    BullModule.forRoot({
      connection: { host: process.env.REDIS_HOST ?? 'localhost', port: Number(process.env.REDIS_PORT ?? 6379) },
    }),
    ScheduleModule.forRoot(), // powers AutomationScheduler's daily @Cron job
    RedisModule,
    AuthModule,
    DashboardModule,
    CustomersModule,
    ReceptionistModule,
    PortalModule,
    HealthModule,
    AutomationModule,
    LeadsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
