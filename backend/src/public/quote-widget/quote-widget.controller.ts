import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../auth/decorators/public.decorator';
import { QuoteWidgetService } from './services/quote-widget.service';
import { SubmitQuoteDto } from './dto/submit-quote.dto';
import { RequestQuoteDto } from './dto/request-quote.dto';

/**
 * The single home for the public-facing Instant Quote Widget, per the
 * approved architecture — deliberately its own module, not folded into
 * LeadsController, since this is expected to grow (roof measurement,
 * coupons, analytics — all future, none in Phase 1). See
 * PROJECT_CONTEXT.md's Quote Widget section.
 */
@Controller('public/:companySlug/quote-widget')
export class QuoteWidgetController {
  constructor(private readonly quoteWidget: QuoteWidgetService) {}

  @Public()
  @Get('services')
  getServices(@Param('companySlug') companySlug: string) {
    return this.quoteWidget.getPublicServices(companySlug);
  }

  @Public()
  @Get('branding')
  getBranding(@Param('companySlug') companySlug: string) {
    return this.quoteWidget.getPublicBranding(companySlug);
  }

  // Tighter than the bare lead-capture endpoint's 3/hour — a full quote
  // (real pricing, real emails, real estimate) is a heavier, more
  // valuable action than a bare lead, so it's worth a slightly more
  // permissive but still tight limit for genuine multi-property
  // homeowners, while staying far below any realistic abuse-free volume.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('quote')
  submitQuote(@Param('companySlug') companySlug: string, @Body() dto: SubmitQuoteDto) {
    return this.quoteWidget.submitQuote(companySlug, dto);
  }

  // Same throttle limit as the instant path — a request submission is
  // just as real an action (creates a genuine CRM customer/lead) even
  // without a price attached.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('request')
  submitRequest(@Param('companySlug') companySlug: string, @Body() dto: RequestQuoteDto) {
    return this.quoteWidget.submitRequest(companySlug, dto);
  }
}
