import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { TenantContextService } from '../tenant/tenant-context.service';

/**
 * Models that are legitimately global, not tenant-scoped — they have no
 * `company_id` column at all (see the audit note on TenantContextService
 * for why: `User` spans companies by design, `OauthAccount`/`RolePermission`
 * are join/detail tables off of global tables). Every other model MUST
 * have tenant context set before it's queried, or the extension below
 * throws rather than silently either leaking or fail-closing.
 */
const TENANT_EXEMPT_MODELS = new Set(['User', 'OauthAccount', 'RolePermission', 'Company', 'Permission', 'Role', 'SubscriptionPlan']);

/**
 * THIS is the fix for the tenant-isolation gap an audit of this codebase
 * found: `withTenantContext` (below) was the only mechanism that ever set
 * `app.current_company_id` — the Postgres session variable every RLS
 * policy in this schema depends on — and it was used in only a couple of
 * places. Every other service called `this.prisma.model.findMany(...)`
 * directly. Verified against a live Postgres instance with a non-superuser
 * role (matching a real production connection, not the local superuser
 * used elsewhere in this project's manual testing, which always bypasses
 * RLS regardless of FORCE ROW LEVEL SECURITY): this caused every
 * tenant-scoped query to silently return zero rows — a total functional
 * failure, not a data leak, but one that would have surfaced the instant
 * this touched a real database.
 *
 * The fix applies automatically to every query on every tenant-scoped
 * model, with no call-site changes required in the ~15 existing service
 * files: a Prisma Client Extension batches a `SET LOCAL` statement and the
 * real query into one Postgres transaction (Prisma's array-form
 * `$transaction([a, b])` runs every item as PrismaPromises on the same
 * connection inside one real transaction) using whatever companyId
 * `TenantContextInterceptor` populated into TenantContextService for the
 * current request. This removes the human-discipline failure point
 * entirely — a developer can no longer "forget" to scope a query, because
 * there's no code path left where scoping is optional.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private extendedClient: ReturnType<PrismaService['buildExtendedClient']> | undefined;

  constructor(private readonly tenantContext: TenantContextService) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.extendedClient = this.buildExtendedClient();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** The tenant-safe client every service should actually use — see the module-level doc comment. */
  get tenant() {
    if (!this.extendedClient) throw new Error('PrismaService not yet initialized');
    return this.extendedClient;
  }

  private buildExtendedClient() {
    const tenantContext = this.tenantContext;
    const baseClient = this;

    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, args, query }) {
            if (!model || TENANT_EXEMPT_MODELS.has(model)) {
              return query(args);
            }

            const companyId = tenantContext.getCompanyId();
            if (!companyId) {
              throw new Error(
                `Tenant context missing for ${model} query — this request reached a tenant-scoped query without ` +
                  `passing through TenantContextInterceptor. This must never happen; it is a bug in request wiring, not a valid path to work around.`,
              );
            }

            const [, result] = await baseClient.$transaction([
              baseClient.$executeRawUnsafe(`SET LOCAL app.current_company_id = '${companyId}'`),
              query(args) as Prisma.PrismaPromise<unknown>,
            ]);
            return result;
          },
        },
      },
    });
  }

  /**
   * Retained for call sites that need several statements to share ONE
   * transaction with a manually-chosen companyId (the customer-merge
   * operation is the one real example) — the automatic per-query path
   * above covers everything else and is what new code should use by
   * injecting `.tenant` rather than calling this directly.
   */
  async withTenantContext<T>(companyId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_company_id = '${companyId}'`);
      return fn(tx as PrismaClient);
    });
  }
}
