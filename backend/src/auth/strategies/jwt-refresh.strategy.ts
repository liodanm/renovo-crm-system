import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { RefreshTokenPayload } from '../interfaces/jwt-payload.interface';
import { TokenService } from '../services/token.service';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    private readonly config: ConfigService,
    private readonly tokenService: TokenService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.jwt.refreshSecret'),
      issuer: config.get<string>('auth.jwt.issuer'),
      passReqToCallback: true,
    });
  }

  /**
   * Refresh tokens are single-use (rotated on every refresh) and validated
   * against the Redis session store by `jti`, not just signature+expiry.
   * This lets us:
   *   1. Detect reuse of an already-rotated token (a strong signal of theft)
   *      and immediately revoke the whole session family.
   *   2. Instantly invalidate a session on logout/"log out all devices"
   *      without waiting for the token to expire.
   */
  async validate(req: Request, payload: RefreshTokenPayload) {
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const rawToken = req.body?.refreshToken as string;
    const session = await this.tokenService.validateRefreshSession(payload.sub, payload.jti, rawToken);

    if (!session) {
      // Reuse of a revoked/rotated token — nuke every session for this user
      // as a precaution, since this pattern indicates a stolen token.
      await this.tokenService.revokeAllSessionsForUser(payload.sub);
      throw new UnauthorizedException('Refresh token is invalid or has already been used');
    }

    return { userId: payload.sub, sessionId: payload.jti, companyId: session.companyId };
  }
}
