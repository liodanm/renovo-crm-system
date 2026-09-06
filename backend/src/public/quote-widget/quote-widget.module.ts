import { Module } from '@nestjs/common';
import { QuoteWidgetController } from './quote-widget.controller';
import { QuoteWidgetService } from './services/quote-widget.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CustomersModule } from '../../customers/customers.module';
import { ServiceCatalogModule } from '../../service-catalog/service-catalog.module';
import { EstimatesModule } from '../../estimates/estimates.module';
import { PortalModule } from '../../portal/portal.module';
import { DocumentsModule } from '../../documents/documents.module';
import { PropertyIntelligenceService } from '../../property-intelligence/property-intelligence.service';
import { SettingsModule } from '../../settings/settings.module';

/**
 * The single home for the public Instant Quote Widget (Phase 1) and its
 * future extensions (roof measurement, coupons, analytics, AI — none
 * built yet). Imports the existing feature modules it orchestrates
 * rather than re-providing their services' full dependency graphs —
 * this is the one correct way to reuse a service that already has its
 * own module without duplicating how it's wired up. See
 * PROJECT_CONTEXT.md's Quote Widget section for the full verified
 * architecture. TenantContextService is @Global() (tenant-context.module.ts)
 * and needs no import here.
 *
 * GeocodingService is deliberately NOT re-provided here — it's now
 * exported by CustomersModule (already imported below) and shares that
 * one instance. GeocodingService holds real per-instance rate-limit
 * state (a `lastRequestAt` timestamp guarding Nominatim's 1 req/sec
 * policy); giving this module its own separate instance would let two
 * independent rate-limit clocks both fire near-simultaneously and
 * exceed the real limit together — a genuine correctness bug, not just
 * a style preference, caught and fixed while wiring this up.
 * PropertyIntelligenceService has no such shared-state concern (Redis
 * itself is the single source of truth for its cache) and has no
 * dedicated module of its own yet, matching GeocodingService's own
 * precedent, so it's provided directly.
 */
@Module({
  imports: [CustomersModule, ServiceCatalogModule, EstimatesModule, PortalModule, DocumentsModule, SettingsModule],
  controllers: [QuoteWidgetController],
  providers: [PrismaService, QuoteWidgetService, PropertyIntelligenceService],
})
export class QuoteWidgetModule {}
