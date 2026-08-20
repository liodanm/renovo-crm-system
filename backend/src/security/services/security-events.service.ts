import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { maskIdentifier } from './security-event.util';

export type SecurityEventType =
  | 'login_success'
  | 'login_failure'
  | 'account_locked'
  | 'logout'
  | 'password_reset_request'
  | 'password_reset_completed'
  | 'registration_success'
  | 'registration_duplicate_attempt'
  | 'invitation_sent'
  | 'invitation_accepted';

export interface RecordSecurityEventInput {
  companyId?: string | null;
  userId?: string | null;
  eventType: SecurityEventType;
  success: boolean;
  /** The raw, real identifier (email) — masked internally before storage, never persisted as-is. Pass undefined for events that don't have a meaningful identifier of their own (e.g. a successful login already has userId). */
  identifier?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** A short, fixed, pre-approved reason code — see the class-level comment for the full list. Never a raw error message. */
  reason?: string | null;
  /** Small, non-sensitive structured context only — see the class-level comment. */
  metadata?: Record<string, unknown> | null;
}

/**
 * The one place every security/audit event in Renovo gets created and
 * queried — reusable infrastructure, not a login-specific service, per
 * this feature's explicit architectural instruction. Every call site in
 * auth.service.ts/token.service.ts goes through recordEvent(), never a
 * direct Prisma write to security_events — keeps the masking and
 * failure-safety guarantees in exactly one place.
 *
 * SENSITIVE DATA: never pass a password, password hash, JWT, refresh
 * token, raw password-reset token, cookie value, or Authorization header
 * into `reason` or `metadata`. `identifier` is the one field allowed to
 * carry a real email — see maskIdentifier() below for what actually gets
 * stored.
 *
 * REASON CODES actually used by this feature's call sites (kept as a
 * fixed, short, safe vocabulary — not free text from an exception
 * message, which could leak internal details):
 * 'invalid_credentials' | 'account_not_found' | 'oauth_only_account' |
 * 'email_not_verified' | 'account_locked' | 'too_many_attempts' |
 * 'duplicate_email' | 'invalid_or_expired_token'
 */
@Injectable()
export class SecurityEventsService {
  private readonly logger = new Logger(SecurityEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * See security-event.util.ts's maskIdentifier — extracted there
   * specifically so this privacy-sensitive transformation has a real,
   * direct unit test, not just indirect coverage through this service.
   */

  /**
   * Never throws. A failed audit insert must never break authentication
   * or expose an error to the end user — per this feature's explicit
   * failure-safety requirement. On failure, logs a warning (via the
   * existing pino logger, which already redacts sensitive header/body
   * paths — see logging.module.ts) so the failure itself is observable
   * in server logs without ever including the credential/token that
   * triggered the security event in the first place.
   */
  async recordEvent(input: RecordSecurityEventInput): Promise<void> {
    try {
      const data = {
        companyId: input.companyId ?? null,
        userId: input.userId ?? null,
        eventType: input.eventType,
        success: input.success,
        identifierMasked: input.identifier ? maskIdentifier(input.identifier) : null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        reason: input.reason ?? null,
        // Cast, not `any` — RecordSecurityEventInput.metadata is
        // Record<string, unknown> for caller ergonomics, but Prisma's
        // generated type for a Json? column wants its own narrower
        // InputJsonValue, which `unknown` values don't structurally
        // satisfy even though every real caller only ever passes plain,
        // JSON-serializable primitives (see this file's own class-level
        // doc comment restricting what may be passed into metadata).
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
      };
      // withTenantContext sets the session variable the RLS policy's
      // WITH CHECK needs for a real companyId to satisfy it — without
      // this, FORCE RLS would reject the insert regardless of the
      // company_id value being genuinely correct, if RLS is actually
      // enforced at the database role level. For a genuinely
      // unattributed event (companyId null — no tenant to scope
      // against, e.g. a failed login on an email matching no real
      // user), there's no context to set, so the base client is used
      // directly; migration 044's WITH CHECK explicitly allows a NULL
      // company_id insert unconditionally.
      if (data.companyId) {
        await this.prisma.withTenantContext(data.companyId, (tx) => tx.securityEvent.create({ data }));
      } else {
        await this.prisma.securityEvent.create({ data });
      }
    } catch (err) {
      this.logger.warn(`Failed to record security event (type=${input.eventType}): ${(err as Error).message}`);
    }
  }

  /**
   * Paginated, filtered activity for one company. Explicit company_id
   * filter (not RLS alone), matching the same defensive pattern already
   * established across every reporting query in this codebase — the
   * caller's companyId always comes from the authenticated JWT, never
   * client input.
   */
  async listEvents(
    companyId: string,
    filters: { eventType?: string; success?: boolean; start?: Date; end?: Date },
    page: number,
    pageSize: number,
  ) {
    const where = {
      companyId,
      ...(filters.eventType ? { eventType: filters.eventType } : {}),
      ...(filters.success !== undefined ? { success: filters.success } : {}),
      ...(filters.start || filters.end
        ? { createdAt: { ...(filters.start ? { gte: filters.start } : {}), ...(filters.end ? { lt: filters.end } : {}) } }
        : {}),
    };

    // withTenantContext + the base transaction's own `tx` client, not
    // `.tenant.$transaction` — this codebase has no existing precedent
    // for calling $transaction on the extended (.tenant) client, and
    // this environment can't run a live Prisma Client to confirm that
    // combination behaves as expected. withTenantContext's tx callback
    // is the proven, already-used-everywhere pattern (see
    // jobs.service.ts's computeAndSaveJobLineItemProfitability for the
    // same tx.model.method() shape), so this reuses that instead of
    // introducing a new, unverified one.
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const [total, events] = await Promise.all([
        tx.securityEvent.count({ where }),
        tx.securityEvent.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { user: { select: { firstName: true, lastName: true, email: true } } },
        }),
      ]);
      return { events, total, page, pageSize };
    });
  }

  /** Backend-computed summary counts — never calculated client-side, per this feature's explicit instruction. */
  async getSummary(companyId: string, start: Date, end: Date) {
    const rows: {
      eventType: string;
      success: boolean;
      count: bigint;
    }[] = await this.prisma.withTenantContext(companyId, (tx) =>
      tx.$queryRaw`
        SELECT event_type AS "eventType", success, COUNT(*) AS count
        FROM security_events
        WHERE company_id = ${companyId}::uuid AND created_at >= ${start} AND created_at < ${end}
        GROUP BY event_type, success
      `,
    );

    const countFor = (type: string, success?: boolean) =>
      rows.filter((r) => r.eventType === type && (success === undefined || r.success === success)).reduce((sum, r) => sum + Number(r.count), 0);

    return {
      successfulLogins: countFor('login_success'),
      failedLoginAttempts: countFor('login_failure'),
      accountLockouts: countFor('account_locked'),
      newRegistrations: countFor('registration_success'),
      staffAccessChanges: countFor('invitation_sent') + countFor('invitation_accepted'),
    };
  }

  /**
   * Simple, deterministic suspicious-activity indicators only — no
   * inferred/ML "risk scoring," per this feature's explicit instruction
   * not to invent suspicious behavior from insufficient data. Currently
   * implements exactly one rule: 3+ failed logins against the same
   * masked identifier within the last hour. Account lockout itself
   * (a separate, already-existing, authoritative mechanism) is not
   * duplicated here — it's already immediately visible as its own
   * ACCOUNT_LOCKED event in the list.
   */
  async getRepeatedFailedLoginIdentifiers(companyId: string): Promise<string[]> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const rows: { identifierMasked: string; count: bigint }[] = await this.prisma.withTenantContext(companyId, (tx) =>
      tx.$queryRaw`
        SELECT identifier_masked AS "identifierMasked", COUNT(*) AS count
        FROM security_events
        WHERE company_id = ${companyId}::uuid AND event_type = 'login_failure' AND created_at >= ${oneHourAgo}
          AND identifier_masked IS NOT NULL
        GROUP BY identifier_masked
        HAVING COUNT(*) >= 3
      `,
    );
    return rows.map((r) => r.identifierMasked);
  }
}
