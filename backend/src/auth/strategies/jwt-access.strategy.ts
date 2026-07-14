import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AccessTokenPayload, AuthenticatedRequestUser } from '../interfaces/jwt-payload.interface';
import { TokenService } from '../services/token.service';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt-access') {
  constructor(
    private readonly config: ConfigService,
    private readonly tokenService: TokenService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.jwt.accessSecret'),
      issuer: config.get<string>('auth.jwt.issuer'),
    });
  }

  /**
   * Runs on every authenticated request. We deliberately do NOT hit the
   * database here — the token itself carries companyId/role/permissions,
   * so this stays O(1) and fast. If a user's role/permissions change
   * mid-session, they take effect on next token refresh (max staleness =
   * access token TTL, 15 min by default) or immediately if we push a
   * forced re-auth via the revocation list in TokenService.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthenticatedRequestUser> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const isRevoked = await this.tokenService.isAccessTokenRevoked(payload.sub, payload.companyId);
    if (isRevoked) {
      throw new UnauthorizedException('Session has been revoked');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      companyId: payload.companyId,
      companyUserId: payload.companyUserId,
      roleId: payload.roleId,
      roleName: payload.roleName,
      permissions: payload.permissions,
    };
  }
}
