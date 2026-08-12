import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from '../../auth/services/password.service'; // reuses hashToken/generateSecureToken — no need to duplicate that logic
import { MailService } from '../../mail/mail.service';
import { PortalTokenPayload } from '../interfaces/portal-token.interface';

const MAGIC_LINK_TTL_SECONDS = 15 * 60; // short-lived — this is a bearer credential emailed in plaintext

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
  private async generateMagicLinkUrl(companyId: string, companySlug: string, customer: { id: string; email: string | null; firstName: string | null }): Promise<string> {
    const rawToken = this.passwordService.generateSecureToken();
    await this.redis.set(
      `portal:magic-link:${this.passwordService.hashToken(rawToken)}`,
      JSON.stringify({ customerId: customer.id, companyId, email: customer.email }),
      'EX',
      MAGIC_LINK_TTL_SECONDS,
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
   * Called by InvoicesService.sendEmail() — generates a real,
   * auto-authenticating portal link for the invoice email, the same
   * kind of one-time token requestMagicLink() already produces, just
   * triggered by the system sending an invoice rather than the
   * customer asking to log in. Returns null (never throws) when the
   * customer has no email on file — the caller decides what that means
   * for the invoice email itself.
   */
  async generateInvoicePortalLink(companyId: string, customerId: string): Promise<string | null> {
    const [company, customer] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } }),
      this.prisma.customer.findFirst({ where: { id: customerId, companyId, deletedAt: null } }),
    ]);
    if (!company || !customer?.email) return null;
    return this.generateMagicLinkUrl(companyId, company.slug, customer);
  }

  async verifyMagicLink(rawToken: string): Promise<{ accessToken: string }> {
    const key = `portal:magic-link:${this.passwordService.hashToken(rawToken)}`;
    const raw = await this.redis.get(key);
    if (!raw) throw new UnauthorizedException('This login link is invalid or has expired');
    await this.redis.del(key); // single-use

    const { customerId, companyId, email } = JSON.parse(raw);

    const payload: PortalTokenPayload = { sub: customerId, companyId, email, type: 'portal' };
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('PORTAL_JWT_SECRET'),
      expiresIn: this.config.get<string>('PORTAL_JWT_TTL_SECONDS', '2592000'), // 30 days — a portal session should feel "logged in", not re-verify constantly
      issuer: 'renovo-crm-portal',
    });

    return { accessToken };
  }
}
