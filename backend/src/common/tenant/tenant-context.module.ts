import { Global, Module } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';

/**
 * @Global() is load-bearing here, not a convenience shortcut. If every
 * module that needs TenantContextService instead listed it in its own
 * local `providers` array (the pattern this codebase otherwise uses for
 * PrismaService), NestJS would create a SEPARATE instance per module —
 * each with its own independent AsyncLocalStorage. The globally-registered
 * TenantContextInterceptor would populate one instance's storage; every
 * feature module's PrismaService would read from a DIFFERENT instance
 * that was never populated. That failure mode is worse than the one this
 * fixes: no error thrown, tenant context just silently never resolves,
 * and every tenant-scoped query fails closed for a reason that looks
 * unrelated to why it's actually happening. One real, shared instance,
 * imported once here, is what makes the interceptor's writes and every
 * service's reads refer to the same storage.
 */
@Global()
@Module({
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenantContextModule {}
