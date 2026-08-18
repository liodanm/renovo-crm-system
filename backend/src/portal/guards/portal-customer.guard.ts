import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PortalTokenPayload, AuthenticatedPortalCustomer } from '../interfaces/portal-token.interface';

/**
 * The single most important piece of code in this module. Every portal
 * endpoint runs behind this guard, which does two things a staff
 * JwtAuthGuard does not:
 *
 *   1. Validates against PORTAL_JWT_SECRET — a completely different secret
 *      from staff JWT_ACCESS_SECRET, so a staff access token (even a
 *      compromised one) is cryptographically incapable of passing this
 *      guard, and vice versa.
 *   2. Rejects anything that isn't `type: 'portal'` — belt-and-suspenders
 *      against the two token shapes ever being interchangeable even if
 *      they somehow shared a secret by misconfiguration.
 *
 * It attaches `{ customerId, companyId, email }` to the request. Services
 * behind this guard are responsible for filtering every query by BOTH
 * companyId (tenant) AND customerId (this specific customer) — RLS covers
 * the tenant boundary the same as everywhere else in Renovo, but nothing
 * in the database schema knows "this customer may only see their own
 * records" — that is purely an application-layer guarantee, which is why
 * every portal service method takes an explicit customerId filter rather
 * than assuming the guard alone is enough.
 */
@Injectable()
export class PortalCustomerGuard implements CanActivate {
  private readonly logger = new Logger(PortalCustomerGuard.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      // Diagnostic only — client-facing behavior unchanged. This branch
      // fires BEFORE the catch block below ever runs, so a failure here
      // was previously invisible to the "Portal token verification failed"
      // log line — this closes that gap.
      this.logger.warn({
        msg: 'Portal request missing Bearer token',
        hasAuthHeader: !!authHeader,
        authHeaderPrefix: authHeader?.slice(0, 10),
        path: request.url,
      });
      throw new UnauthorizedException('Missing portal access token');
    }

    const token = authHeader.slice('Bearer '.length);

    let payload: PortalTokenPayload;
    try {
      payload = this.jwt.verify(token, {
        secret: this.config.get<string>('PORTAL_JWT_SECRET'),
        issuer: 'renovo-crm-portal',
      });
    } catch (err) {
      // Diagnostic only — client-facing behavior (generic 401, same message)
      // is unchanged. Every portal token verification has been failing here
      // with no visibility into why: expired, wrong signature (secret
      // mismatch), wrong issuer, or malformed. err.name distinguishes these
      // (TokenExpiredError / JsonWebTokenError / NotBeforeError) — logged
      // server-side only, never in the response.
      this.logger.warn({
        msg: 'Portal token verification failed',
        errorName: (err as Error)?.name,
        errorMessage: (err as Error)?.message,
        tokenLength: token?.length,
        path: request.url,
      });
      throw new UnauthorizedException('Invalid or expired portal session');
    }

    if (payload.type !== 'portal') {
      this.logger.warn({
        msg: 'Portal token had wrong type claim',
        actualType: payload.type,
        path: request.url,
      });
      throw new UnauthorizedException('Invalid token type');
    }

    const customer: AuthenticatedPortalCustomer = {
      customerId: payload.sub,
      companyId: payload.companyId,
      email: payload.email,
    };
    request.portalCustomer = customer;
    return true;
  }
}
