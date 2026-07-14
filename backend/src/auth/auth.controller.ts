import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { SwitchCompanyDto } from './dto/switch-company.dto';
import { InviteAcceptDto } from './dto/invite-accept.dto';
import { AuthenticatedRequestUser } from './interfaces/jwt-payload.interface';
import { OAuthProfile } from './strategies/google.strategy';
import { RequirePermissions } from './decorators/permissions.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
    private readonly config: ConfigService,
  ) {}

  // ===========================================================================
  // Registration / login
  // ===========================================================================

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // resists automated mass account creation
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // credential-stuffing/brute-force resistance — the global 100/min default is far too permissive for a login endpoint
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, this.extractDevice(req));
  }

  @Public()
  @Post('select-company')
  @HttpCode(HttpStatus.OK)
  selectCompany(@Body() body: { preAuthToken: string; companyId: string }, @Req() req: Request) {
    return this.authService.selectCompany(body.preAuthToken, body.companyId, this.extractDevice(req));
  }

  // ===========================================================================
  // Token lifecycle
  // ===========================================================================

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Req() req: Request & { user: { userId: string; sessionId: string; companyId: string } }) {
    const { userId, sessionId, companyId } = req.user;
    return this.authService.refresh(userId, sessionId, companyId, this.extractDevice(req));
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser() user: AuthenticatedRequestUser, @Body() body: { jti?: string }) {
    // In practice the frontend passes the jti it received at login; if
    // omitted, we fall back to revoking nothing here and rely on access
    // token expiry (15 min) — the frontend SHOULD always send it.
    return body.jti ? this.authService.logout(user.userId, body.jti) : { message: 'Logged out (local session cleared)' };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  logoutAll(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.authService.logoutAllDevices(user.userId);
  }

  @Get('sessions')
  async listSessions(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.tokenService.listActiveSessions(user.userId);
  }

  @Delete('sessions/:jti')
  @HttpCode(HttpStatus.OK)
  async revokeSession(@CurrentUser() user: AuthenticatedRequestUser, @Param('jti') jti: string) {
    await this.tokenService.revokeSession(user.userId, jti);
    return { message: 'Session revoked' };
  }

  // ===========================================================================
  // Email verification
  // ===========================================================================

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  resendVerification(@Body() body: { email: string }) {
    return this.authService.resendVerificationEmail(body.email);
  }

  // ===========================================================================
  // Password reset
  // ===========================================================================

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } }) // an outage-grade abuse vector otherwise: repeatedly emailing someone's inbox
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  // ===========================================================================
  // Multi-company
  // ===========================================================================

  @Get('my-companies')
  listMyCompanies(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.authService.listMyCompanies(user.userId);
  }

  @Post('switch-company')
  @HttpCode(HttpStatus.OK)
  switchCompany(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: SwitchCompanyDto, @Req() req: Request) {
    return this.authService.switchCompany(user.userId, dto.companyId, this.extractDevice(req));
  }

  // ===========================================================================
  // Team invites (employee onboarding) — inviting requires 'users.manage'
  // ===========================================================================

  @RequirePermissions('users.manage')
  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  invite(@CurrentUser() user: AuthenticatedRequestUser, @Body() body: { email: string; roleId: string }) {
    return this.authService.inviteTeamMember(user.companyId, user.userId, body.email, body.roleId);
  }

  @Public()
  @Get('invite/:token')
  previewInvite(@Param('token') token: string) {
    return this.authService.previewInvite(token);
  }

  @Public()
  @Post('accept-invite')
  @HttpCode(HttpStatus.OK)
  acceptInvite(@Body() dto: InviteAcceptDto, @Req() req: Request) {
    return this.authService.acceptInvite(dto.inviteToken, dto.password, this.extractDevice(req));
  }

  // ===========================================================================
  // Current user
  // ===========================================================================

  @Get('me')
  me(@CurrentUser() user: AuthenticatedRequestUser) {
    return user;
  }

  // ===========================================================================
  // Google OAuth
  // ===========================================================================

  @Public()
  @UseGuards(AuthGuard('google'))
  @Get('google')
  googleLogin() {
    // Passport redirects to Google's consent screen; nothing to do here.
  }

  @Public()
  @UseGuards(AuthGuard('google'))
  @Get('google/callback')
  async googleCallback(@Req() req: Request & { user: OAuthProfile }, @Res() res: Response) {
    const result = await this.authService.handleOAuthLogin(req.user, this.extractDevice(req));
    return this.redirectWithAuthResult(res, result);
  }

  // ===========================================================================
  // Microsoft OAuth
  // ===========================================================================

  @Public()
  @UseGuards(AuthGuard('microsoft'))
  @Get('microsoft')
  microsoftLogin() {}

  @Public()
  @UseGuards(AuthGuard('microsoft'))
  @Get('microsoft/callback')
  async microsoftCallback(@Req() req: Request & { user: OAuthProfile }, @Res() res: Response) {
    const result = await this.authService.handleOAuthLogin(req.user, this.extractDevice(req));
    return this.redirectWithAuthResult(res, result);
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private extractDevice(req: Request) {
    return {
      userAgent: req.headers['user-agent'],
      ipAddress: (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress,
    };
  }

  /**
   * OAuth callbacks can't return JSON directly to a browser navigation —
   * we redirect back to the frontend with short-lived, single-use data
   * either via a fragment (tokens) or a query param (pre-auth flow), and
   * the frontend's /auth/google/callback page immediately exchanges/stores
   * them and clears the URL. Tokens are never logged or persisted server-side
   * beyond the existing Redis session record created by issueTokenPair.
   */
  private redirectWithAuthResult(res: Response, result: any) {
    const frontendUrl = this.config.get<string>('auth.frontendUrl');

    if (result.requiresCompanySelection) {
      const url = `${frontendUrl}/select-company?preAuthToken=${encodeURIComponent(result.preAuthToken)}`;
      return res.redirect(url);
    }

    const url = `${frontendUrl}/auth/callback#accessToken=${encodeURIComponent(
      result.accessToken,
    )}&refreshToken=${encodeURIComponent(result.refreshToken)}`;
    return res.redirect(url);
  }
}
