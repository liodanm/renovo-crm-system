import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService, DeviceInfo } from './token.service';
import { MailService } from '../../mail/mail.service';
import { SecurityEventsService } from '../../security/services/security-events.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { AccessTokenPayload } from '../interfaces/jwt-payload.interface';
import { OAuthProfile } from '../strategies/google.strategy';
import { slugify } from '../../common/util/slugify';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  // =========================================================================
  // REGISTRATION — always creates a new company with the user as `owner`
  // =========================================================================

  async register(dto: RegisterDto, device?: DeviceInfo) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) {
      // No companyId here on purpose — this request never reached the
      // point of creating (or joining) a company, so there's nothing
      // real to attribute the event to. Still recorded (companyId
      // null), per this feature's "retain for future platform-level
      // visibility" design — see migration 044.
      await this.securityEvents.recordEvent({
        eventType: 'registration_duplicate_attempt',
        success: false,
        identifier: dto.email,
        ipAddress: device?.ipAddress,
        userAgent: device?.userAgent,
        reason: 'duplicate_email',
      });
      // Same message whether the email exists or not would be ideal for
      // enumeration resistance, but registration UX generally needs to tell
      // the user their email is taken so they can log in instead — we accept
      // that tradeoff here (unlike login/forgot-password, which stay generic).
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const slug = await this.generateUniqueCompanySlug(dto.companyName);

    const { user, company } = await this.prisma.$transaction(async (tx) => {
      const ownerRole = await tx.role.findFirst({ where: { name: 'owner', companyId: null } });
      if (!ownerRole) throw new Error('System role "owner" is not seeded — run the base migration first');

      const company = await tx.company.create({
        data: { name: dto.companyName, slug, status: 'trial' },
      });

      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
        },
      });

      await tx.companyUser.create({
        data: {
          companyId: company.id,
          userId: user.id,
          roleId: ownerRole.id,
          status: 'active',
          joinedAt: new Date(),
        },
      });

      return { user, company };
    });

    const verificationToken = await this.tokenService.createEmailVerificationToken(user.id);
    await this.mailService.sendVerificationEmail(user.email, user.firstName, verificationToken);

    await this.securityEvents.recordEvent({
      companyId: company.id,
      userId: user.id,
      eventType: 'registration_success',
      success: true,
      ipAddress: device?.ipAddress,
      userAgent: device?.userAgent,
    });

    return {
      message: 'Account created. Check your email to verify your address.',
      userId: user.id,
      companyId: company.id,
    };
  }

  // =========================================================================
  // LOGIN
  // =========================================================================

  async login(dto: LoginDto, device: DeviceInfo) {
    if (await this.tokenService.isLoginLocked(dto.email)) {
      // Still worth attribution if the email matches a real user — an
      // owner should see repeated attempts against an already-locked
      // account, not just the single moment it first locked. This
      // lookup doesn't touch the password-comparison timing at all
      // (no password check happens on this branch either way), so it
      // doesn't weaken the constant-time behavior the rest of this
      // method is careful about.
      const lockedUser = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
      await this.recordLoginFailureForUser(lockedUser, dto.email, device, 'account_locked');
      throw new ForbiddenException('Too many failed login attempts. Try again in 15 minutes.');
    }

    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });

    // Constant-shape response whether the user exists or not, and whether
    // the password is wrong or missing (OAuth-only account) — all resolve
    // to the same generic "Invalid email or password" to resist account
    // enumeration and credential stuffing.
    const passwordValid = user?.passwordHash
      ? await this.passwordService.verify(user.passwordHash, dto.password)
      : await this.passwordService.verify('$argon2id$v=19$m=19456,t=2,p=1$dummysaltdummysalt$dummyhash', dto.password); // dummy verify to keep timing constant

    if (!user || !passwordValid) {
      const justLockedOut = await this.tokenService.recordFailedLoginAttempt(dto.email);
      await this.recordLoginFailureForUser(user, dto.email, device, user ? 'invalid_credentials' : 'account_not_found');
      if (justLockedOut && user) {
        const companies = await this.getUserCompanyMemberships(user.id);
        await Promise.all(
          companies.map((c) =>
            this.securityEvents.recordEvent({
              companyId: c.companyId,
              userId: user.id,
              eventType: 'account_locked',
              success: false,
              identifier: dto.email,
              ipAddress: device.ipAddress,
              userAgent: device.userAgent,
              reason: 'too_many_attempts',
              metadata: { lockoutDurationSeconds: 900 },
            }),
          ),
        );
      }
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.tokenService.clearFailedLoginAttempts(dto.email);

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Please verify your email address before logging in');
    }

    const companies = await this.getUserCompanyMemberships(user.id);
    if (companies.length === 0) {
      throw new ForbiddenException('This account is not associated with any active company');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    await Promise.all(
      companies.map((c) =>
        this.securityEvents.recordEvent({
          companyId: c.companyId,
          userId: user.id,
          eventType: 'login_success',
          success: true,
          ipAddress: device.ipAddress,
          userAgent: device.userAgent,
        }),
      ),
    );

    // Single company → log straight in. Multiple companies → the frontend
    // shows a "choose a workspace" screen and calls /auth/switch-company,
    // which is really just "issue tokens" using the same logic below.
    if (companies.length === 1) {
      const tokens = await this.issueTokensForCompanyMembership(user.id, user.email, companies[0], device);
      return { ...tokens, requiresCompanySelection: false };
    }

    const preAuthToken = await this.tokenService.issuePreAuthToken(user.id);

    return {
      requiresCompanySelection: true,
      companies: companies.map((c) => ({ companyId: c.companyId, companyName: c.companyName, role: c.roleName })),
      preAuthToken,
    };
  }

  /**
   * Exchanges a pre-auth token (issued by login()/handleOAuthLogin() when a
   * user belongs to multiple companies) plus a chosen companyId for a real,
   * company-scoped token pair. This is a PUBLIC endpoint — the pre-auth
   * token itself is the credential, since the user already proved their
   * password/OAuth identity to get it.
   */
  async selectCompany(preAuthToken: string, companyId: string, device: DeviceInfo) {
    let userId: string;
    try {
      userId = this.tokenService.verifyPreAuthToken(preAuthToken).sub;
    } catch {
      throw new UnauthorizedException('This session has expired. Please log in again.');
    }

    const memberships = await this.getUserCompanyMemberships(userId);
    const membership = memberships.find((m) => m.companyId === companyId);
    if (!membership) {
      throw new ForbiddenException('You do not have access to this company');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.issueTokensForCompanyMembership(userId, user.email, membership, device);
  }

  // =========================================================================
  // TOKEN REFRESH / LOGOUT
  // =========================================================================

  async refresh(userId: string, oldJti: string, companyId: string, device: DeviceInfo) {
    const membership = await this.getUserCompanyMemberships(userId).then((list) =>
      list.find((c) => c.companyId === companyId),
    );
    if (!membership) {
      throw new UnauthorizedException('No active access to this company');
    }

    await this.tokenService.rotateRefreshSession(userId, oldJti);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.issueTokensForCompanyMembership(userId, user.email, membership, device);
  }

  async logout(userId: string, jti: string, device?: DeviceInfo) {
    await this.tokenService.revokeSession(userId, jti);
    await this.recordLogoutEvent(userId, device);
    return { message: 'Logged out' };
  }

  async logoutAllDevices(userId: string, device?: DeviceInfo) {
    await this.tokenService.revokeAllSessionsForUser(userId);
    await this.recordLogoutEvent(userId, device);
    return { message: 'Logged out of all devices' };
  }

  private async recordLogoutEvent(userId: string, device?: DeviceInfo) {
    const companies = await this.getUserCompanyMemberships(userId);
    await Promise.all(
      companies.map((c) =>
        this.securityEvents.recordEvent({
          companyId: c.companyId,
          userId,
          eventType: 'logout',
          success: true,
          ipAddress: device?.ipAddress,
          userAgent: device?.userAgent,
        }),
      ),
    );
  }

  // =========================================================================
  // EMAIL VERIFICATION
  // =========================================================================

  async verifyEmail(rawToken: string) {
    const userId = await this.tokenService.consumeEmailVerificationToken(rawToken);
    if (!userId) {
      throw new UnauthorizedException('This verification link is invalid or has expired');
    }

    await this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    return { message: 'Email verified successfully' };
  }

  async resendVerificationEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Always return the same generic success message regardless of whether
    // the account exists or is already verified — prevents enumeration.
    if (user && !user.emailVerifiedAt) {
      const token = await this.tokenService.createEmailVerificationToken(user.id);
      await this.mailService.sendVerificationEmail(user.email, user.firstName, token);
    }
    return { message: 'If an account exists for that email, a verification link has been sent.' };
  }

  // =========================================================================
  // PASSWORD RESET
  // =========================================================================

  async forgotPassword(email: string, device?: DeviceInfo) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user) {
      const token = await this.tokenService.createPasswordResetToken(user.id);
      await this.mailService.sendPasswordResetEmail(user.email, user.firstName, token);
      const companies = await this.getUserCompanyMemberships(user.id);
      await Promise.all(
        companies.map((c) =>
          this.securityEvents.recordEvent({
            companyId: c.companyId,
            userId: user.id,
            eventType: 'password_reset_request',
            success: true,
            ipAddress: device?.ipAddress,
            userAgent: device?.userAgent,
          }),
        ),
      );
    }
    // Generic response either way — do not reveal whether the email exists.
    // No event recorded for the "email doesn't exist" case — there's
    // nothing here that represents a real security action (no token was
    // created, no email was sent), just an inbound request against an
    // address with no account, which forgot-password's own 3/min
    // throttle already covers as an abuse vector.
    return { message: 'If an account exists for that email, a password reset link has been sent.' };
  }

  async resetPassword(rawToken: string, newPassword: string, device?: DeviceInfo) {
    const userId = await this.tokenService.consumePasswordResetToken(rawToken);
    if (!userId) {
      throw new UnauthorizedException('This reset link is invalid or has expired');
    }

    const passwordHash = await this.passwordService.hash(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    // Resetting a password is a strong security event — kill every existing
    // session so a potentially-compromised device is immediately logged out.
    await this.tokenService.revokeAllSessionsForUser(userId);

    const companies = await this.getUserCompanyMemberships(userId);
    await Promise.all(
      companies.map((c) =>
        this.securityEvents.recordEvent({
          companyId: c.companyId,
          userId,
          eventType: 'password_reset_completed',
          success: true,
          ipAddress: device?.ipAddress,
          userAgent: device?.userAgent,
        }),
      ),
    );

    return { message: 'Password reset successfully. Please log in again.' };
  }

  // =========================================================================
  // MULTI-COMPANY SUPPORT
  // =========================================================================

  async switchCompany(userId: string, companyId: string, device: DeviceInfo) {
    const memberships = await this.getUserCompanyMemberships(userId);
    const membership = memberships.find((m) => m.companyId === companyId);
    if (!membership) {
      throw new ForbiddenException('You do not have access to this company');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.issueTokensForCompanyMembership(userId, user.email, membership, device);
  }

  async listMyCompanies(userId: string) {
    const memberships = await this.getUserCompanyMemberships(userId);
    return memberships.map((m) => ({ companyId: m.companyId, companyName: m.companyName, role: m.roleName }));
  }

  // =========================================================================
  // GOOGLE / MICROSOFT OAUTH
  // =========================================================================

  /**
   * Find-or-create + account-linking logic shared by both providers.
   * Matching is done by verified email: if a user already has a
   * password-based (or other-provider) Renovo account under the same
   * email, the OAuth identity is LINKED to that existing account rather
   * than creating a duplicate — this is safe specifically because OAuth
   * providers only return emails they themselves have verified.
   *
   * A brand-new OAuth signup, with no company yet, creates a personal
   * company exactly like email/password registration does.
   */
  async handleOAuthLogin(profile: OAuthProfile, device: DeviceInfo) {
    const existingLink = await this.prisma.oauthAccount.findUnique({
      where: { provider_providerAccountId: { provider: profile.provider, providerAccountId: profile.providerAccountId } },
      include: { user: true },
    });

    let user = existingLink?.user ?? null;

    if (!user) {
      user = await this.prisma.user.findUnique({ where: { email: profile.email.toLowerCase() } });

      if (user) {
        // Link this OAuth identity to the existing account.
        await this.prisma.oauthAccount.create({
          data: { userId: user.id, provider: profile.provider, providerAccountId: profile.providerAccountId },
        });
      } else {
        // Brand new user + brand new company, owner role, auto-verified
        // (the OAuth provider already verified this email address).
        const slug = await this.generateUniqueCompanySlug(`${profile.firstName}'s Company`);
        const created = await this.prisma.$transaction(async (tx) => {
          const ownerRole = await tx.role.findFirst({ where: { name: 'owner', companyId: null } });
          if (!ownerRole) throw new Error('System role "owner" is not seeded');

          const company = await tx.company.create({ data: { name: `${profile.firstName}'s Company`, slug, status: 'trial' } });
          const newUser = await tx.user.create({
            data: {
              email: profile.email.toLowerCase(),
              firstName: profile.firstName,
              lastName: profile.lastName,
              avatarUrl: profile.avatarUrl,
              emailVerifiedAt: new Date(),
            },
          });
          await tx.companyUser.create({
            data: { companyId: company.id, userId: newUser.id, roleId: ownerRole.id, status: 'active', joinedAt: new Date() },
          });
          await tx.oauthAccount.create({
            data: { userId: newUser.id, provider: profile.provider, providerAccountId: profile.providerAccountId },
          });
          return newUser;
        });
        user = created;
      }
    }

    if (!user.emailVerifiedAt) {
      await this.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const companies = await this.getUserCompanyMemberships(user.id);
    if (companies.length === 1) {
      const tokens = await this.issueTokensForCompanyMembership(user.id, user.email, companies[0], device);
      return { ...tokens, requiresCompanySelection: false };
    }

    const preAuthToken = await this.tokenService.issuePreAuthToken(user.id);

    return {
      requiresCompanySelection: true,
      companies: companies.map((c) => ({ companyId: c.companyId, companyName: c.companyName, role: c.roleName })),
      preAuthToken,
    };
  }

  // =========================================================================
  // TEAM INVITES — how owners/admins add employees to their company
  // =========================================================================

  /**
   * Called from a route guarded by @RequirePermissions('users.manage').
   * `roleId` must be one of the six system roles or a custom role scoped
   * to this company — validated here so an admin can't grant a role from
   * a different company.
   */
  async inviteTeamMember(companyId: string, invitedByUserId: string, email: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, OR: [{ companyId }, { companyId: null }] },
    });
    if (!role) {
      throw new NotFoundException('Role not found for this company');
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existingUser) {
      const alreadyMember = await this.prisma.companyUser.findUnique({
        where: { companyId_userId: { companyId, userId: existingUser.id } },
      });
      if (alreadyMember) {
        throw new ConflictException('This person is already part of your company');
      }
    }

    const inviter = await this.prisma.user.findUniqueOrThrow({ where: { id: invitedByUserId } });
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });

    const token = await this.tokenService.createCompanyInviteToken({
      companyId,
      email: email.toLowerCase(),
      roleId,
      invitedByUserId,
    });

    await this.mailService.sendCompanyInviteEmail(email, company.name, `${inviter.firstName} ${inviter.lastName}`, token);

    await this.securityEvents.recordEvent({
      companyId,
      userId: invitedByUserId,
      eventType: 'invitation_sent',
      success: true,
      identifier: email,
      metadata: { roleId },
    });

    return { message: `Invitation sent to ${email}` };
  }

  async previewInvite(rawToken: string) {
    const invite = await this.tokenService.peekCompanyInviteToken(rawToken);
    if (!invite) throw new NotFoundException('This invite is invalid or has expired');

    const [company, role] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: invite.companyId } }),
      this.prisma.role.findUniqueOrThrow({ where: { id: invite.roleId } }),
    ]);
    const userExists = !!(await this.prisma.user.findUnique({ where: { email: invite.email } }));

    return { companyName: company.name, roleName: role.name, email: invite.email, requiresPassword: !userExists };
  }

  async acceptInvite(rawToken: string, password: string | undefined, device: DeviceInfo) {
    const invite = await this.tokenService.consumeCompanyInviteToken(rawToken);
    if (!invite) {
      throw new UnauthorizedException('This invite is invalid or has expired');
    }

    let user = await this.prisma.user.findUnique({ where: { email: invite.email } });

    if (!user) {
      if (!password) {
        throw new ForbiddenException('A password is required to create your account');
      }
      const passwordHash = await this.passwordService.hash(password);
      // First/last name collected client-side on the "accept invite" form
      // and passed through; simplified here to keep the method signature
      // focused — see InviteAcceptDto in a fuller implementation.
      user = await this.prisma.user.create({
        data: {
          email: invite.email,
          passwordHash,
          firstName: 'New',
          lastName: 'Employee',
          emailVerifiedAt: new Date(), // invite link itself proves email ownership
        },
      });
    }

    await this.prisma.companyUser.upsert({
      where: { companyId_userId: { companyId: invite.companyId, userId: user.id } },
      create: {
        companyId: invite.companyId,
        userId: user.id,
        roleId: invite.roleId,
        status: 'active',
        invitedByUserId: invite.invitedByUserId,
        joinedAt: new Date(),
      },
      update: { status: 'active', joinedAt: new Date() },
    });

    const memberships = await this.getUserCompanyMemberships(user.id);
    const membership = memberships.find((m) => m.companyId === invite.companyId)!;

    await this.securityEvents.recordEvent({
      companyId: invite.companyId,
      userId: user.id,
      eventType: 'invitation_accepted',
      success: true,
      identifier: user.email,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
      metadata: { roleId: invite.roleId, invitedByUserId: invite.invitedByUserId },
    });

    return this.issueTokensForCompanyMembership(user.id, user.email, membership, device);
  }

  // =========================================================================
  // Internal helpers
  // =========================================================================

  private async issueTokensForCompanyMembership(
    userId: string,
    email: string,
    membership: CompanyMembership,
    device: DeviceInfo,
  ) {
    const permissions = await this.getPermissionKeysForRole(membership.roleId);

    const payload: Omit<AccessTokenPayload, 'type'> = {
      sub: userId,
      email,
      companyId: membership.companyId,
      companyUserId: membership.companyUserId,
      roleId: membership.roleId,
      roleName: membership.roleName,
      permissions,
    };

    return this.tokenService.issueTokenPair(payload, device);
  }

  /**
   * Shared by both login-failure branches (already-locked, and
   * wrong-password) — attributes a login_failure event to every company
   * the matched user belongs to, or records it unattributed (companyId
   * null) if the email doesn't match any real user at all. Never
   * throws — recordEvent() already guarantees that on its own, but
   * kept as a thin wrapper here so both call sites share one place to
   * change this attribution logic.
   */
  private async recordLoginFailureForUser(user: { id: string } | null, email: string, device: DeviceInfo, reason: string) {
    if (!user) {
      await this.securityEvents.recordEvent({
        eventType: 'login_failure',
        success: false,
        identifier: email,
        ipAddress: device.ipAddress,
        userAgent: device.userAgent,
        reason,
      });
      return;
    }
    const companies = await this.getUserCompanyMemberships(user.id);
    await Promise.all(
      companies.map((c) =>
        this.securityEvents.recordEvent({
          companyId: c.companyId,
          userId: user.id,
          eventType: 'login_failure',
          success: false,
          identifier: email,
          ipAddress: device.ipAddress,
          userAgent: device.userAgent,
          reason,
        }),
      ),
    );
  }

  private async getUserCompanyMemberships(userId: string): Promise<CompanyMembership[]> {
    const memberships = await this.prisma.companyUser.findMany({
      where: { userId, status: 'active', company: { status: { in: ['trial', 'active'] }, deletedAt: null } },
      include: { company: true, role: true },
    });

    return memberships.map((m) => ({
      companyId: m.companyId,
      companyUserId: m.id,
      companyName: m.company.name,
      roleId: m.roleId,
      roleName: m.role.name,
    }));
  }

  private async getPermissionKeysForRole(roleId: string): Promise<string[]> {
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: true },
    });
    return rolePermissions.map((rp) => rp.permission.key);
  }

  private async generateUniqueCompanySlug(name: string): Promise<string> {
    const base = slugify(name);
    let candidate = base;
    let suffix = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.company.findUnique({ where: { slug: candidate } });
      if (!existing) return candidate;
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
  }
}

interface CompanyMembership {
  companyId: string;
  companyUserId: string;
  companyName: string;
  roleId: string;
  roleName: string;
}
