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

  async requestMagicLink(companySlug: string, email: string): Promise<{ message: string }> {
    const company = await this.prisma.company.findUnique({ where: { slug: companySlug } });
    // Same enumeration-resistance pattern as staff forgot-password: identical
    // response whether or not the email matches a real customer, so a portal
    // login page can't be used to discover who is/isn't a customer.
    if (company) {
      const customer = await this.prisma.customer.findFirst({ where: { companyId: company.id, email: email.toLowerCase(), deletedAt: null } });
      if (customer) {
        const rawToken = this.passwordService.generateSecureToken();
        await this.redis.set(
          `portal:magic-link:${this.passwordService.hashToken(rawToken)}`,
          JSON.stringify({ customerId: customer.id, companyId: company.id, email: customer.email }),
          'EX',
          MAGIC_LINK_TTL_SECONDS,
        );
        const portalUrl = this.config.get<string>('PORTAL_URL', 'https://portal.renovocrm.com');
        await this.mail.sendPortalMagicLink(customer.email!, customer.firstName ?? 'there', `${portalUrl}/${companySlug}/verify?token=${rawToken}`);
      }
    }
    return { message: 'If that email is on file, a login link has been sent.' };
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
