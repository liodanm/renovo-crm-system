import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from '../../auth/services/password.service'; // reuses hashToken/generateSecureToken — no need to duplicate that logic
import { MailService } from '../../mail/mail.service';
import { PortalTokenPayload } from '../interfaces/portal-token.interface';

// 72 hours (259200s) — extended from the original 15-minute default per
// the portal link expiration audit. Configurable via
// PORTAL_MAGIC_LINK_TTL_SECONDS, mirroring the same env-var pattern
// PORTAL_JWT_TTL_SECONDS already uses below — not a second hardcoded
// constant with no way to tune it without a redeploy. Still genuinely
// short-lived relative to the 30-day portal session it exchanges for:
// this only governs how long the single-use email link itself stays
// clickable, not how long the resulting authenticated session lasts.

/**
 * No password, ever — a customer portal account holds nothing worth a
 * credential-stuffing target (no company data, only that one customer's own
 * records), and password reset flows are a disproportionate amount of
 * support burden for what a portal actually needs. Magic link is the
 * simpler, equally-secure choice for this specific threat model: possession
 * of the email inbox is treated as sufficient identity proof, exactly like
 * every "log in with email" consumer product does.
 */
@Injectable()
export class PortalAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly mail: MailService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  /**
   * The shared core both requestMagicLink() (customer types their email
   * into the portal login form) and the invoice-email flow
   * (system-initiated, no login form involved) go through — one token
   * mechanism, two ways of arriving at it, not two implementations of
   * "prove this person owns this email." Always lands on the portal
   * dashboard after verification — the existing verify page hardcodes
   * that destination today (confirmed, not assumed), and there's no
   * invoice-specific page to send them to yet (Phase 2B, not built).
   */
  private isSafeRedirectTarget(redirectTo: string): boolean {
    // Must be a plain internal portal path — no scheme (http:, javascript:,
    // etc.), no protocol-relative "//" prefix (browsers treat that as an
    // external host), and confined specifically to /portal/... routes.
    // This is deliberately conservative: reject anything that doesn't
    // cleanly match rather than trying to enumerate every unsafe pattern.
    return /^\/portal\/[a-zA-Z0-9\-_/]*$/.test(redirectTo) && !redirectTo.includes('//', 1);
  }

  private async generateMagicLinkUrl(companyId: string, companySlug: string, customer: { id: string; email: string | null; firstName: string | null }, redirectTo?: string): Promise<string> {
    const rawToken = this.passwordService.generateSecureToken();
    const safeRedirectTo = redirectTo && this.isSafeRedirectTarget(redirectTo) ? redirectTo : undefined;
    await this.redis.set(
      `portal:magic-link:${this.passwordService.hashToken(rawToken)}`,
      JSON.stringify({ customerId: customer.id, companyId, email: customer.email, redirectTo: safeRedirectTo }),
      'EX',
      Number(this.config.get<string>('PORTAL_MAGIC_LINK_TTL_SECONDS', '259200')), // 259200 = 72 hours
    );
    const portalUrl = this.config.get<string>('PORTAL_URL', 'https://portal.renovocrm.com');
    return `${portalUrl}/${companySlug}/verify?token=${rawToken}`;
  }

  async requestMagicLink(companySlug: string, email: string): Promise<{ message: string }> {
    const company = await this.prisma.company.findUnique({ where: { slug: companySlug } });
    // Same enumeration-resistance pattern as staff forgot-password: identical
    // response whether or not the email matches a real customer, so a portal
    // login page can't be used to discover who is/isn't a customer.
    if (company) {
      const customer = await this.prisma.customer.findFirst({ where: { companyId: company.id, email: email.toLowerCase(), deletedAt: null } });
      if (customer) {
        const url = await this.generateMagicLinkUrl(company.id, companySlug, customer);
        await this.mail.sendPortalMagicLink(customer.email!, customer.firstName ?? 'there', url);
      }
    }
    return { message: 'If that email is on file, a login link has been sent.' };
  }

  /**
   * Called by InvoicesService.sendEmail() and EstimatesService.sendEmail()
   * — generates a real,
   * auto-authenticating portal link for the invoice email, the same
   * kind of one-time token requestMagicLink() already produces, just
   * triggered by the system sending an invoice rather than the
   * customer asking to log in. Returns null (never throws) when the
   * customer has no email on file — the caller decides what that means
   * for the invoice email itself.
   */
  /**
   * Generates a real, auto-authenticating portal link — the same kind
   * of one-time token requestMagicLink() already produces, just
   * triggered by the system sending a document rather than the
   * customer asking to log in. redirectTo (e.g. "/invoices/abc123" or
   * "/estimates/xyz789") is honored by verifyMagicLink() below, so the
   * customer lands directly on the specific document instead of the
   * generic dashboard. Returns null (never throws) when the customer
   * has no email on file — the caller decides what that means for
   * their own email.
   */
  async generatePortalLink(companyId: string, customerId: string, redirectTo?: string): Promise<string | null> {
    const [company, customer] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } }),
      this.prisma.customer.findFirst({ where: { id: customerId, companyId, deletedAt: null } }),
    ]);
    if (!company || !customer?.email) return null;
    return this.generateMagicLinkUrl(companyId, company.slug, customer, redirectTo);
  }

  /**
   * Permanent, reusable document link — replaces generatePortalLink()
   * for Estimate/Invoice customer links specifically. The old method
   * (left completely intact below) stays exactly as it was for the
   * login-magic-link flow, which is a genuinely different use case (a
   * one-time proof-of-email-ownership that exchanges for a session) —
   * this is instead a stable, Postgres-backed credential meant to be
   * clicked from the same old email repeatedly, forever, until
   * explicitly revoked.
   *
   * A real, disclosed design tradeoff: the task's own security
   * requirement ("never store a raw/recoverable token, hash-only") and
   * "resend reuses the identical link" are mutually exclusive — a
   * one-way hash cannot be reversed to reproduce the same URL string
   * for a second email. Resolved in favor of the security requirement:
   * every call here mints a fresh token, but first revokes any prior
   * active token for the same document, so there is still only ever
   * ONE valid token per document at a time (the actual spirit of "don't
   * accumulate stale tokens" — a clean, bounded set of live
   * credentials) rather than an ever-growing list. The real,
   * user-facing consequence: after a resend, a customer's OLDER email
   * link stops working — only the MOST RECENTLY sent email's link is
   * ever valid. Documented plainly in this feature's final report, not
   * silently accepted.
   */
  async getOrCreateDocumentToken(companyId: string, customerId: string, document: { estimateId?: string; invoiceId?: string }): Promise<string | null> {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, companyId, deletedAt: null }, select: { id: true } });
    if (!customer) return null;

    await this.revokeDocumentToken(companyId, document);

    const rawToken = this.passwordService.generateSecureToken();
    await this.prisma.withTenantContext(companyId, (tx) =>
      tx.$executeRaw`
        INSERT INTO portal_document_tokens (token_hash, company_id, customer_id, estimate_id, invoice_id)
        VALUES (${this.passwordService.hashToken(rawToken)}, ${companyId}::uuid, ${customerId}::uuid, ${document.estimateId ?? null}::uuid, ${document.invoiceId ?? null}::uuid)
      `,
    );

    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } });
    if (!company) return null;
    const portalUrl = this.config.get<string>('PORTAL_URL', 'https://portal.renovocrm.com');
    const redirectTo = document.estimateId ? `/portal/estimates/${document.estimateId}` : `/portal/invoices/${document.invoiceId}`;
    return `${portalUrl}/${company.slug}/document?token=${rawToken}&redirectTo=${encodeURIComponent(redirectTo)}`;
  }

  /**
   * Verifies a permanent document token and exchanges it for the same
   * kind of portal session JWT verifyMagicLink() already issues —
   * reusing the identical session mechanism, not a second one. Unlike
   * verifyMagicLink(), never deletes the token: this is a reusable
   * credential, so the same email link must keep working the next time
   * it's clicked, from any device, indefinitely, until explicitly
   * revoked. Updates last_used_at for audit visibility only.
   */
  async verifyDocumentToken(rawToken: string): Promise<{ accessToken: string; redirectTo: string }> {
    const tokenHash = this.passwordService.hashToken(rawToken);
    const rows = await this.prisma.$queryRaw<
      { id: string; companyId: string; customerId: string; estimateId: string | null; invoiceId: string | null; email: string | null }[]
    >`
      SELECT t.id, t.company_id AS "companyId", t.customer_id AS "customerId", t.estimate_id AS "estimateId", t.invoice_id AS "invoiceId", c.email
      FROM portal_document_tokens t
      JOIN customers c ON c.id = t.customer_id AND c.company_id = t.company_id AND c.deleted_at IS NULL
      WHERE t.token_hash = ${tokenHash} AND t.revoked_at IS NULL
    `;
    if (rows.length === 0) throw new UnauthorizedException('This link is invalid or has been revoked');
    const token = rows[0];

    // Ownership re-verified here, not assumed from the token row alone
    // — if the underlying Estimate/Invoice was deleted or reassigned
    // since the token was issued, this must fail exactly like any
    // other broken-reference lookup, never silently grant access.
    if (token.estimateId) {
      const estimate = await this.prisma.estimate.findFirst({ where: { id: token.estimateId, companyId: token.companyId, customerId: token.customerId } });
      if (!estimate) throw new UnauthorizedException('This estimate is no longer available');
    }
    if (token.invoiceId) {
      const invoice = await this.prisma.invoice.findFirst({ where: { id: token.invoiceId, companyId: token.companyId, customerId: token.customerId } });
      if (!invoice) throw new UnauthorizedException('This invoice is no longer available');
    }

    await this.prisma.withTenantContext(token.companyId, (tx) =>
      tx.$executeRaw`UPDATE portal_document_tokens SET last_used_at = now() WHERE id = ${token.id}::uuid`,
    );

    const payload: PortalTokenPayload = { sub: token.customerId, companyId: token.companyId, email: token.email, type: 'portal' };
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('PORTAL_JWT_SECRET'),
      expiresIn: this.config.get<string>('PORTAL_JWT_TTL_SECONDS', '2592000'),
      issuer: 'renovo-crm-portal',
    });
    const redirectTo = token.estimateId ? `/portal/estimates/${token.estimateId}` : `/portal/invoices/${token.invoiceId}`;
    return { accessToken, redirectTo };
  }

  /** Explicit revocation — the one way these otherwise-permanent links stop working, per the requirement that they remain revocable, not merely long-lived. */
  async revokeDocumentToken(companyId: string, document: { estimateId?: string; invoiceId?: string }): Promise<void> {
    await this.prisma.withTenantContext(companyId, (tx) =>
      tx.$executeRaw`
        UPDATE portal_document_tokens SET revoked_at = now()
        WHERE company_id = ${companyId}::uuid AND revoked_at IS NULL
          AND estimate_id IS NOT DISTINCT FROM ${document.estimateId ?? null}::uuid
          AND invoice_id IS NOT DISTINCT FROM ${document.invoiceId ?? null}::uuid
      `,
    );
  }

  async verifyMagicLink(rawToken: string): Promise<{ accessToken: string; redirectTo: string | null }> {
    const key = `portal:magic-link:${this.passwordService.hashToken(rawToken)}`;
    const raw = await this.redis.get(key);
    if (!raw) throw new UnauthorizedException('This login link is invalid or has expired');
    await this.redis.del(key); // single-use

    const { customerId, companyId, email, redirectTo } = JSON.parse(raw);

    const payload: PortalTokenPayload = { sub: customerId, companyId, email, type: 'portal' };
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('PORTAL_JWT_SECRET'),
      expiresIn: this.config.get<string>('PORTAL_JWT_TTL_SECONDS', '2592000'), // 30 days — a portal session should feel "logged in", not re-verify constantly
      issuer: 'renovo-crm-portal',
    });

    return { accessToken, redirectTo: redirectTo ?? null };
  }
}
