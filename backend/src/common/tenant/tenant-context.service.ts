import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  companyId: string;
}

/**
 * Carries the current request's companyId through the async call stack
 * without threading it through every function signature — exactly the
 * pattern documented in Renovo's original architecture blueprint
 * ("Tenant Context Interceptor... AsyncLocalStorage"), which this class
 * and TenantContextInterceptor actually implement. An audit of the running
 * codebase found that implementation had never been wired in: every
 * service called `this.prisma.model.findMany(...)` directly, and the only
 * mechanism that ever set the Postgres session variable RLS depends on
 * (`PrismaService.withTenantContext`) was used in a small handful of
 * places. Verified against a live Postgres instance with a non-superuser
 * role (matching a real production connection) that this actually causes
 * every tenant-scoped query to silently return zero rows — RLS fails
 * closed, not open, so it's a total functional break rather than a data
 * leak, but it means the application would not have worked at all the
 * moment it touched a real, correctly-configured database connection.
 */
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContext>();

  run<T>(context: TenantContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  getCompanyId(): string | undefined {
    return this.storage.getStore()?.companyId;
  }

  requireCompanyId(): string {
    const companyId = this.getCompanyId();
    if (!companyId) {
      throw new Error('No tenant context set — this indicates a request reached a tenant-scoped query without passing through TenantContextInterceptor. This is a bug, not a valid request path.');
    }
    return companyId;
  }
}
