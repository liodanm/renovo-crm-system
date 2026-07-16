import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { PasswordService } from './services/password.service';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { MicrosoftStrategy } from './strategies/microsoft.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { MailModule } from '../mail/mail.module';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * "OAuth is optional — email/password login works without it" was always
 * the documented design intent (see docs/PROJECT_STRUCTURE.md), but was
 * never actually correct: GoogleStrategy/MicrosoftStrategy call Passport's
 * base OAuth2Strategy constructor unconditionally, which THROWS if
 * clientID is empty — and NestJS eagerly constructs every provider at
 * startup regardless of whether anything ever uses it. The result: the
 * entire application failed to boot the moment it ran anywhere that
 * hadn't configured Google/Microsoft OAuth, not just "sign in with
 * Google" quietly being unavailable. This computes the provider list
 * BEFORE the @Module() decorator runs, so an unconfigured strategy is
 * never constructed at all, rather than constructed-and-crashing.
 */
const optionalOAuthProviders = [
  ...(process.env.GOOGLE_CLIENT_ID ? [GoogleStrategy] : []),
  ...(process.env.MICROSOFT_CLIENT_ID ? [MicrosoftStrategy] : []),
];

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}), // secrets are passed per-call (access vs refresh use different secrets)
    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    PrismaService,
    AuthService,
    TokenService,
    PasswordService,
    JwtAccessStrategy,
    JwtRefreshStrategy,
    ...optionalOAuthProviders,
    // Registered globally, in order: authenticate -> check role -> check
    // permissions. Each guard no-ops if its decorator isn't present on the
    // route, so unmarked routes only pay the JwtAuthGuard cost.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
