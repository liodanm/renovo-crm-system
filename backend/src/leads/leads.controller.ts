import { Body, Controller, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';

@Controller('public')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  /**
   * The only intentionally-unauthenticated WRITE endpoint in the entire
   * system — a stranger who found the website has no account yet, by
   * definition. That makes this the highest-abuse-risk endpoint here:
   * tight rate limiting (3/hour per IP, far below any legitimate use
   * pattern) plus the honeypot field in the DTO are the two real defenses,
   * since there's no auth to rate-limit abuse against otherwise.
   */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @Post(':companySlug/leads')
  captureLead(@Param('companySlug') companySlug: string, @Body() dto: CreateLeadDto) {
    return this.leads.captureLead(companySlug, dto);
  }
}
