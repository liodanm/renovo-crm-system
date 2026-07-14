import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

export interface OAuthProfile {
  provider: 'google' | 'microsoft';
  providerAccountId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  emailVerified: boolean;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly config: ConfigService) {
    super({
      clientID: config.get<string>('auth.oauth.google.clientId'),
      clientSecret: config.get<string>('auth.oauth.google.clientSecret'),
      callbackURL: config.get<string>('auth.oauth.google.callbackUrl'),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      return done(new Error('Google account has no email on file'), undefined);
    }

    const oauthProfile: OAuthProfile = {
      provider: 'google',
      providerAccountId: profile.id,
      email,
      firstName: profile.name?.givenName ?? profile.displayName ?? 'Unknown',
      lastName: profile.name?.familyName ?? '',
      avatarUrl: profile.photos?.[0]?.value,
      // Google only surfaces verified email addresses via `emails[0].verified`
      // on some profile shapes; email_verified from the ID token is the
      // authoritative source and is treated as true for Google logins since
      // Google itself gates account creation on email ownership.
      emailVerified: true,
    };

    done(null, oauthProfile);
  }
}
