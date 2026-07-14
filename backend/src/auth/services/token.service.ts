import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { AccessTokenPayload } from '../interfaces/jwt-payload.interface';
import { PasswordService } from './password.service';

export interface DeviceInfo {
  userAgent?: string;
  ipAddress?: string;
}

export interface RefreshSession {
  userId: string;
  companyId: string;
  tokenHash: string;
  device: DeviceInfo;
  createdAt: string;
}

const SESSION_KEY = (userId: string, jti: string) => `auth:session:${userId}:${jti}`;
const USER_SESSIONS_INDEX = (userId: string) => `auth:sessions:${userId}`;
const REVOKED_KEY = (userId: string, companyId: string) => `auth:revoked:${userId}:${companyId}`;
const EMAIL_VERIFY_KEY = (hash: string) => `auth:email-verify:${hash}`;
const PASSWORD_RESET_KEY = (hash: string) => `auth:password-reset:${hash}`;
const LOGIN_ATTEMPTS_KEY = (email: string) => `auth:login-attempts:${email.toLowerCase()}`;
const LOGIN_LOCKOUT_KEY = (email: string) => `auth:login-lockout:${email.toLowerCase()}`;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly passwordService: PasswordService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  // ---------------------------------------------------------------------
  // Access / refresh token issuance
  // ---------------------------------------------------------------------

  async issueTokenPair(payload: Omit<AccessTokenPayload, 'type'>, device: DeviceInfo) {
    const accessToken = this.jwt.sign(
      { ...payload, type: 'access' },
      {
        secret: this.config.get('auth.jwt.accessSecret'),
        expiresIn: this.config.get('auth.jwt.accessTtlSeconds'),
        issuer: this.config.get('auth.jwt.issuer'),
      },
    );

    const jti = randomUUID();
    const refreshTtl = this.getNumber('auth.jwt.refreshTtlSeconds', 2592000);
    const refreshToken = this.jwt.sign(
      { sub: payload.sub, jti, type: 'refresh' },
      {
        secret: this.config.get('auth.jwt.refreshSecret'),
        expiresIn: refreshTtl,
        issuer: this.config.get('auth.jwt.issuer'),
      },
    );

    const session: RefreshSession = {
      userId: payload.sub,
      companyId: payload.companyId,
      tokenHash: this.passwordService.hashToken(refreshToken),
      device,
      createdAt: new Date().toISOString(),
    };

    const key = SESSION_KEY(payload.sub, jti);
    await this.redis
      .multi()
      .set(key, JSON.stringify(session), 'EX', refreshTtl as number)
      .sadd(USER_SESSIONS_INDEX(payload.sub), jti)
      .expire(USER_SESSIONS_INDEX(payload.sub), refreshTtl)
      .exec();

    return { accessToken, refreshToken };
  }

  /**
   * Refresh flow: validate + rotate. The old session is deleted and a brand
   * new (access, refresh) pair is issued, with a NEW jti. This "rotation"
   * pattern means each refresh token is single-use — if a stolen refresh
   * token is used, the legitimate user's next refresh attempt will fail
   * (already rotated), which is the reuse-detection signal handled in
   * JwtRefreshStrategy.
   */
  async rotateRefreshSession(userId: string, oldJti: string) {
    await this.redis.multi().del(SESSION_KEY(userId, oldJti)).srem(USER_SESSIONS_INDEX(userId), oldJti).exec();
  }

  async validateRefreshSession(userId: string, jti: string, rawToken: string): Promise<RefreshSession | null> {
    const raw = await this.redis.get(SESSION_KEY(userId, jti));
    if (!raw) return null;

    const session: RefreshSession = JSON.parse(raw);
    const tokenHash = this.passwordService.hashToken(rawToken);
    if (tokenHash !== session.tokenHash) return null;

    return session;
  }

  async revokeAllSessionsForUser(userId: string) {
    const jtis = await this.redis.smembers(USER_SESSIONS_INDEX(userId));
    if (jtis.length === 0) return;
    const pipeline = this.redis.multi();
    jtis.forEach((jti) => pipeline.del(SESSION_KEY(userId, jti)));
    pipeline.del(USER_SESSIONS_INDEX(userId));
    await pipeline.exec();
  }

  async revokeSession(userId: string, jti: string) {
    await this.redis.multi().del(SESSION_KEY(userId, jti)).srem(USER_SESSIONS_INDEX(userId), jti).exec();
  }

  async listActiveSessions(userId: string): Promise<Array<RefreshSession & { jti: string }>> {
    const jtis = await this.redis.smembers(USER_SESSIONS_INDEX(userId));
    if (jtis.length === 0) return [];
    const raws = await this.redis.mget(jtis.map((jti) => SESSION_KEY(userId, jti)));
    return raws
      .map((raw, i) => (raw ? { ...(JSON.parse(raw) as RefreshSession), jti: jtis[i] } : null))
      .filter((s): s is RefreshSession & { jti: string } => s !== null);
  }

  // ---------------------------------------------------------------------
  // Forced access-token revocation (role/permission changes, security events)
  // A short-TTL flag checked by JwtAccessStrategy on every request — cheap,
  // and self-expires once the flagged access tokens would have expired anyway.
  // ---------------------------------------------------------------------

  async revokeAccessTokensForCompanyUser(userId: string, companyId: string) {
    const ttl = this.getNumber('auth.jwt.accessTtlSeconds', 900);
    await this.redis.set(REVOKED_KEY(userId, companyId), '1', 'EX', ttl as number);
  }

  async isAccessTokenRevoked(userId: string, companyId: string): Promise<boolean> {
    const flagged = await this.redis.get(REVOKED_KEY(userId, companyId));
    return flagged === '1';
  }

  // ---------------------------------------------------------------------
  // Email verification tokens (single-use, 24h TTL, stored hashed)
  // ---------------------------------------------------------------------

  async createEmailVerificationToken(userId: string): Promise<string> {
    const rawToken = this.passwordService.generateSecureToken();
    const ttl = this.getNumber('auth.tokens.emailVerificationTtlSeconds', 86400);
    await this.redis.set(EMAIL_VERIFY_KEY(this.passwordService.hashToken(rawToken)), userId, 'EX', ttl as number);
    return rawToken;
  }

  async consumeEmailVerificationToken(rawToken: string): Promise<string | null> {
    const key = EMAIL_VERIFY_KEY(this.passwordService.hashToken(rawToken));
    const userId = await this.redis.get(key);
    if (!userId) return null;
    await this.redis.del(key); // single-use
    return userId;
  }

  // ---------------------------------------------------------------------
  // Password reset tokens (single-use, 1h TTL, stored hashed)
  // ---------------------------------------------------------------------

  async createPasswordResetToken(userId: string): Promise<string> {
    const rawToken = this.passwordService.generateSecureToken();
    const ttl = this.getNumber('auth.tokens.passwordResetTtlSeconds', 3600);
    await this.redis.set(PASSWORD_RESET_KEY(this.passwordService.hashToken(rawToken)), userId, 'EX', ttl as number);
    return rawToken;
  }

  async consumePasswordResetToken(rawToken: string): Promise<string | null> {
    const key = PASSWORD_RESET_KEY(this.passwordService.hashToken(rawToken));
    const userId = await this.redis.get(key);
    if (!userId) return null;
    await this.redis.del(key);
    return userId;
  }

  // ---------------------------------------------------------------------
  // Pre-auth tokens — issued after password/OAuth validation succeeds but
  // BEFORE a company is chosen, for users belonging to multiple companies.
  // Short-lived (5 min), single-purpose: proves "this request just proved
  // it owns these credentials" without granting access to any company's
  // data. The subsequent POST /auth/select-company call exchanges this
  // for a real, company-scoped token pair.
  // ---------------------------------------------------------------------

  async issuePreAuthToken(userId: string): Promise<string> {
    return this.jwt.sign(
      { sub: userId, type: 'pre_auth' },
      {
        secret: this.config.get('auth.jwt.accessSecret'),
        expiresIn: 300, // 5 minutes
        issuer: this.config.get('auth.jwt.issuer'),
      },
    );
  }

  verifyPreAuthToken(token: string): { sub: string } {
    const payload = this.jwt.verify(token, {
      secret: this.config.get('auth.jwt.accessSecret'),
      issuer: this.config.get('auth.jwt.issuer'),
    });
    if (payload.type !== 'pre_auth') {
      throw new Error('Invalid token type');
    }
    return payload;
  }

  // ---------------------------------------------------------------------
  // Company invites — how owners/admins add employees. Stored in Redis
  // (not the `company_users` table) until accepted, because the invitee
  // may not have a `users` row yet and `company_users.user_id` is NOT NULL.
  // ---------------------------------------------------------------------

  async createCompanyInviteToken(data: {
    companyId: string;
    email: string;
    roleId: string;
    invitedByUserId: string;
  }): Promise<string> {
    const rawToken = this.passwordService.generateSecureToken();
    const ttlSeconds = 60 * 60 * 24 * 7; // 7 days
    await this.redis.set(
      `auth:invite:${this.passwordService.hashToken(rawToken)}`,
      JSON.stringify(data),
      'EX',
      ttlSeconds,
    );
    return rawToken;
  }

  async peekCompanyInviteToken(rawToken: string) {
    const raw = await this.redis.get(`auth:invite:${this.passwordService.hashToken(rawToken)}`);
    return raw ? (JSON.parse(raw) as { companyId: string; email: string; roleId: string; invitedByUserId: string }) : null;
  }

  async consumeCompanyInviteToken(rawToken: string) {
    const key = `auth:invite:${this.passwordService.hashToken(rawToken)}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    await this.redis.del(key);
    return JSON.parse(raw) as { companyId: string; email: string; roleId: string; invitedByUserId: string };
  }

  // ---------------------------------------------------------------------
  // Login throttling — protects against credential-stuffing / brute force
  // ---------------------------------------------------------------------

  async recordFailedLoginAttempt(email: string): Promise<void> {
    const window = this.getNumber('auth.security.loginLockoutWindowSeconds', 900);
    const max = this.getNumber('auth.security.maxLoginAttemptsPerWindow', 5);
    const key = LOGIN_ATTEMPTS_KEY(email);

    const attempts = await this.redis.incr(key);
    if (attempts === 1) {
      await this.redis.expire(key, window);
    }

    if (attempts >= max) {
      const lockoutDuration = this.getNumber('auth.security.loginLockoutDurationSeconds', 900);
      await this.redis.set(LOGIN_LOCKOUT_KEY(email), '1', 'EX', lockoutDuration as number);
    }
  }

  async clearFailedLoginAttempts(email: string): Promise<void> {
    await this.redis.del(LOGIN_ATTEMPTS_KEY(email));
  }

  async isLoginLocked(email: string): Promise<boolean> {
    const locked = await this.redis.get(LOGIN_LOCKOUT_KEY(email));
    return locked === '1';
  }
  /** ConfigService.get<T>() is typed as possibly-undefined; this centralizes the fallback. */
  private getNumber(key: string, fallback: number): number {
    return this.config.get<number>(key) ?? fallback;
  }
}
