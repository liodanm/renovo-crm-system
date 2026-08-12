import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
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
import { QuoteWidgetModule } from './public/quote-widget/quote-widget.module';
import { LoggingModule } from './common/logging/logging.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TenantContextModule } from './common/tenant/tenant-context.module';
import { TenantContextInterceptor } from './common/tenant/tenant-context.interceptor';
import { EstimatesModule } from './estimates/estimates.module';
import { JobsModule } from './jobs/jobs.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { ServiceCatalogModule } from './service-catalog/service-catalog.module';
import { SettingsModule } from './settings/settings.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { ReportsModule } from './reports/reports.module';
import { SearchModule } from './search/search.module';
import { IntegrationsModule } from './common/integrations/integrations.module';
import { SmsModule } from './sms/sms.module';

@Module({
  imports: [
    LoggingModule, // registered first — every other module's logger calls should already be structured
    ConfigModule.forRoot({ isGlobal: true, load: [authConfig] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), // global baseline; auth endpoints add their own tighter limits
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD,
      },
    }),
    ScheduleModule.forRoot(), // powers AutomationScheduler's daily @Cron job
    TenantContextModule, // @Global() — makes TenantContextService one real shared instance across every feature module, not one per module
    RedisModule,
    AuthModule,
    DashboardModule,
    CustomersModule,
    ReceptionistModule,
    PortalModule,
    HealthModule,
    AutomationModule,
    LeadsModule,
    QuoteWidgetModule,
    EstimatesModule,
    JobsModule,
    SchedulingModule,
    ServiceCatalogModule,
    SettingsModule,
    InvoicesModule,
    PaymentsModule,
    ReportsModule,
    SearchModule,
    IntegrationsModule,
    SmsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // NestJS runs Guards before Interceptors on every request, regardless
    // of array order here — so request.user (set by JwtAuthGuard, a guard)
    // is already populated by the time this interceptor runs.
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule {}
