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

const optionalOAuthProviders = [
  ...(process.env.GOOGLE_CLIENT_ID ? [GoogleStrategy] : []),
  ...(process.env.MICROSOFT_CLIENT_ID ? [MicrosoftStrategy] : []),
];

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
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
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
