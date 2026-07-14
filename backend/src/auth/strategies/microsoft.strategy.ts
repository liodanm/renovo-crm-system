import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-microsoft';
import { ConfigService } from '@nestjs/config';
import { OAuthProfile } from './google.strategy';

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
  constructor(private readonly config: ConfigService) {
    super({
      clientID: config.get<string>('auth.oauth.microsoft.clientId'),
      clientSecret: config.get<string>('auth.oauth.microsoft.clientSecret'),
      callbackURL: config.get<string>('auth.oauth.microsoft.callbackUrl'),
      // 'common' allows both personal Microsoft accounts and any Azure AD
      // work/school tenant to sign in — appropriate for a SaaS product
      // whose customers bring their own Microsoft 365 tenants.
      tenant: config.get<string>('auth.oauth.microsoft.tenantId'),
      scope: ['user.read'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (err: Error | null, user?: OAuthProfile) => void,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value ?? (profile as any)._json?.mail ?? (profile as any)._json?.userPrincipalName;

    if (!email) {
      return done(new Error('Microsoft account has no email on file'));
    }

    const oauthProfile: OAuthProfile = {
      provider: 'microsoft',
      providerAccountId: profile.id,
      email,
      firstName: profile.name?.givenName ?? 'Unknown',
      lastName: profile.name?.familyName ?? '',
      avatarUrl: undefined, // requires an extra Microsoft Graph photo call — omitted for v1
      emailVerified: true,
    };

    done(null, oauthProfile);
  }
}
