import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';

/**
 * The actual fix for the raw 500 on /auth/google and /auth/microsoft when
 * unconfigured. Root cause: auth.module.ts only constructs
 * GoogleStrategy/MicrosoftStrategy when the corresponding CLIENT_ID env
 * var is present (this already fixed a worse bug — the whole app used to
 * fail to boot otherwise). But the routes themselves are always declared
 * on the controller and always run AuthGuard('google'/'microsoft'), which
 * throws an unhandled "Unknown authentication strategy" error the moment
 * that strategy was never registered — surfacing as an opaque 500 instead
 * of a clean, intentional response.
 *
 * NestJS runs guards in the order listed in @UseGuards(). Placing this
 * guard BEFORE AuthGuard(provider) means an unconfigured provider is
 * rejected cleanly here, and AuthGuard never gets a chance to look for a
 * strategy that was never registered.
 */
@Injectable()
export class OAuthConfiguredGuard implements CanActivate {
  constructor(private readonly provider: 'google' | 'microsoft') {}

  canActivate(_context: ExecutionContext): boolean {
    const envVar = this.provider === 'google' ? 'GOOGLE_CLIENT_ID' : 'MICROSOFT_CLIENT_ID';
    if (!process.env[envVar]) {
      throw new ServiceUnavailableException(
        `Sign in with ${this.provider === 'google' ? 'Google' : 'Microsoft'} is not configured for this account yet. Please use your email and password instead.`,
      );
    }
    return true;
  }
}

export function requireOAuthConfigured(provider: 'google' | 'microsoft') {
  return new OAuthConfiguredGuard(provider);
}
