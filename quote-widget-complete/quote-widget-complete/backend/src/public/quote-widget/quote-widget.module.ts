import { Module } from '@nestjs/common';
import { QuoteWidgetController } from './quote-widget.controller';
import { QuoteWidgetService } from './services/quote-widget.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CustomersModule } from '../../customers/customers.module';
import { ServiceCatalogModule } from '../../service-catalog/service-catalog.module';
import { EstimatesModule } from '../../estimates/estimates.module';
import { PortalModule } from '../../portal/portal.module';
import { DocumentsModule } from '../../documents/documents.module';

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
 */
@Module({
  imports: [CustomersModule, ServiceCatalogModule, EstimatesModule, PortalModule, DocumentsModule],
  controllers: [QuoteWidgetController],
  providers: [PrismaService, QuoteWidgetService],
})
export class QuoteWidgetModule {}
