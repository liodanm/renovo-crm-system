import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from './tenant-context.service';

/**
 * The piece that was missing. `TenantContextService` and the Prisma
 * extension that reads from it (see prisma.service.ts) were both real —
 * what never existed was anything that actually CALLED
 * `tenantContextService.run(...)` at the start of a request. Every
 * tenant-scoped query was therefore guaranteed to hit the "Tenant context
 * missing" fail-closed error, on every request, for the entire
 * application — this is the fix, not an enhancement.
 *
 * Runs globally (registered as APP_INTERCEPTOR in AppModule). Two
 * possible sources for the current company, checked in order:
 *   - `request.user.companyId` — set by JwtAccessStrategy for staff auth
 *   - `request.portalCustomer.companyId` — set by PortalCustomerGuard for
 *     customer portal auth
 * Neither present (a public route — health check, Twilio/Stripe webhooks,
 * the login endpoints themselves) means this intentionally does nothing;
 * those routes either don't touch tenant-scoped tables at all, or resolve
 * their own companyId explicitly within the service (the receptionist's
 * webhook handlers are the concrete example — company is resolved from
 * the dialed phone number, not a logged-in user).
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const companyId = request.user?.companyId ?? request.portalCustomer?.companyId;

    if (!companyId) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      this.tenantContext.run({ companyId }, () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
