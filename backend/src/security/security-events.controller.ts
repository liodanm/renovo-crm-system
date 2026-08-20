import { Controller, Get, Query } from '@nestjs/common';
import { SecurityEventsService } from './services/security-events.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuthenticatedRequestUser } from '../auth/interfaces/jwt-payload.interface';

/**
 * Every route here requires 'security.activity' (granted to owner/admin
 * only by migration 044) — matches this feature's explicit access
 * requirement: an owner/admin can review suspicious activity, but not
 * every staff member gets authentication intelligence about every
 * account. This is the real enforcement boundary; the frontend nav item
 * hiding this page from non-owners is a UX convenience on top of this,
 * not a substitute for it.
 */
@Controller('security-events')
@RequirePermissions('security.activity')
export class SecurityEventsController {
  constructor(private readonly securityEvents: SecurityEventsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query('eventType') eventType?: string,
    @Query('success') success?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.securityEvents.listEvents(
      user.companyId,
      {
        eventType: eventType || undefined,
        success: success === 'true' ? true : success === 'false' ? false : undefined,
        start: start ? new Date(start) : undefined,
        end: end ? new Date(end) : undefined,
      },
      page ? Math.max(1, parseInt(page, 10)) : 1,
      pageSize ? Math.min(100, Math.max(1, parseInt(pageSize, 10))) : 25,
    );
    return {
      ...result,
      // IP address is real, sensitive, operational data — visible here
      // (the owner/admin-only endpoint) but this response shape is
      // deliberately never reused anywhere a customer or unauthorized
      // staff member could see it, per this feature's explicit
      // "never expose IP in customer-facing surfaces" requirement.
      events: result.events.map((e: any) => ({
        id: e.id,
        eventType: e.eventType,
        success: e.success,
        identifierMasked: e.identifierMasked,
        userName: e.user ? `${e.user.firstName ?? ''} ${e.user.lastName ?? ''}`.trim() || e.user.email : null,
        ipAddress: e.ipAddress,
        userAgent: e.userAgent,
        reason: e.reason,
        metadata: e.metadata,
        createdAt: e.createdAt,
      })),
    };
  }

  @Get('summary')
  async summary(@CurrentUser() user: AuthenticatedRequestUser, @Query('start') start: string, @Query('end') end: string) {
    return this.securityEvents.getSummary(user.companyId, new Date(start), new Date(end));
  }

  /**
   * Simple, deterministic suspicious-activity indicator — see
   * SecurityEventsService.getRepeatedFailedLoginIdentifiers's own
   * comment for why this is the one rule implemented, not an inferred
   * risk score.
   */
  @Get('suspicious')
  async suspicious(@CurrentUser() user: AuthenticatedRequestUser) {
    const identifiers = await this.securityEvents.getRepeatedFailedLoginIdentifiers(user.companyId);
    return { repeatedFailedLoginIdentifiers: identifiers };
  }
}
