import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { SettingsService } from './services/settings.service';
import { IntegrationsService } from './services/integrations.service';
import {
  UpdateProfileDto,
  ChangePasswordDto,
  UpdateCompanyDto,
  UpdateBusinessDefaultsDto,
  UpdateBrandingDto,
  UpdatePaymentSettingsDto,
  UpdateEmailSettingsDto,
  UpdateBusinessLinksDto,
  SendTestEmailDto,
  SendTestSmsDto,
  UpdateLeadSourcesDto,
  UpdatePackageDiscountsDto,
} from './dto/settings.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuthenticatedRequestUser } from '../auth/interfaces/jwt-payload.interface';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly integrations: IntegrationsService,
  ) {}

  // Profile — any authenticated user manages their own, no special permission needed
  @Get('profile')
  getProfile(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.settings.getProfile(user.userId);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: UpdateProfileDto) {
    return this.settings.updateProfile(user.userId, dto);
  }

  @Post('profile/change-password')
  changePassword(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: ChangePasswordDto) {
    return this.settings.changePassword(user.userId, dto);
  }

  // Company — business-level config. settings.manage (not estimates.write)
  // is the permission actually designed for this — using estimates.write
  // here was a real scoping bug: dispatcher has estimates.write without
  // settings.manage, which would have let dispatchers edit tax rates,
  // business hours, and branding. owner/admin are unaffected either way
  // since both already carry settings.manage via their wildcard grants.
  @Get('company')
  getCompany(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.settings.getCompany(user.companyId);
  }

  @Patch('company')
  @RequirePermissions('settings.manage')
  updateCompany(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: UpdateCompanyDto) {
    return this.settings.updateCompany(user.companyId, dto);
  }

  // Business Defaults
  @Get('business-defaults')
  getBusinessDefaults(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.settings.getBusinessDefaults(user.companyId);
  }

  @Patch('business-defaults')
  @RequirePermissions('settings.manage')
  updateBusinessDefaults(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: UpdateBusinessDefaultsDto) {
    return this.settings.updateBusinessDefaults(user.companyId, dto);
  }

  // Branding
  @Get('branding')
  getBranding(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.settings.getBranding(user.companyId);
  }

  @Patch('branding')
  @RequirePermissions('settings.manage')
  updateBranding(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: UpdateBrandingDto) {
    return this.settings.updateBranding(user.companyId, dto);
  }

  // Lead Sources
  @Get('lead-sources')
  getLeadSources(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.settings.getLeadSources(user.companyId);
  }

  @Patch('lead-sources')
  @RequirePermissions('settings.manage')
  updateLeadSources(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: UpdateLeadSourcesDto) {
    return this.settings.updateLeadSources(user.companyId, dto);
  }

  // Package Discounts
  @Get('package-discounts')
  getPackageDiscounts(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.settings.getPackageDiscounts(user.companyId);
  }

  @Patch('package-discounts')
  @RequirePermissions('settings.manage')
  updatePackageDiscounts(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: UpdatePackageDiscountsDto) {
    return this.settings.updatePackageDiscounts(user.companyId, dto);
  }

  // Payment Settings
  @Get('payments')
  getPaymentSettings(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.settings.getPaymentSettings(user.companyId);
  }

  @Patch('payments')
  @RequirePermissions('settings.manage')
  updatePaymentSettings(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: UpdatePaymentSettingsDto) {
    return this.settings.updatePaymentSettings(user.companyId, dto);
  }

  // Email Settings
  @Get('email')
  getEmailSettings(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.settings.getEmailSettings(user.companyId);
  }

  @Patch('email')
  @RequirePermissions('settings.manage')
  updateEmailSettings(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: UpdateEmailSettingsDto) {
    return this.settings.updateEmailSettings(user.companyId, dto);
  }

  @Post('email/test')
  @RequirePermissions('settings.manage')
  sendTestEmail(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: SendTestEmailDto) {
    return this.settings.sendTestEmail(user.companyId, dto);
  }

  // SMS Settings
  @Get('sms')
  getSmsSettings() {
    return this.settings.getSmsSettings();
  }

  @Post('sms/test')
  @RequirePermissions('settings.manage')
  sendTestSms(@Body() dto: SendTestSmsDto) {
    return this.settings.sendTestSms(dto);
  }

  // Storage Settings
  @Get('storage')
  getStorageSettings() {
    return this.settings.getStorageSettings();
  }

  // ---- Integrations (single consolidated page) ----
  // All read endpoints are open to any authenticated user, same as every
  // other status endpoint above (Payments/Email/SMS/Storage). Mutating
  // endpoints (verify/test/links) require settings.manage, same permission
  // used everywhere else in this controller — no new permission invented.

  @Get('integrations')
  getIntegrations(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.integrations.getProviders(user.companyId);
  }

  @Get('integrations/health')
  getIntegrationsHealth(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.integrations.getSystemHealth(user.companyId);
  }

  @Post('integrations/:provider/verify')
  @RequirePermissions('settings.manage')
  verifyIntegration(@CurrentUser() user: AuthenticatedRequestUser, @Param('provider') provider: string) {
    return this.integrations.verifyProvider(user.companyId, provider as any);
  }

  @Post('integrations/postmark/test')
  @RequirePermissions('settings.manage')
  testPostmarkIntegration(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: SendTestEmailDto) {
    return this.integrations.testProvider(user.companyId, 'postmark', { toEmail: dto.toEmail });
  }

  @Post('integrations/twilio/test')
  @RequirePermissions('settings.manage')
  testTwilioIntegration(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: SendTestSmsDto) {
    return this.integrations.testProvider(user.companyId, 'twilio', { toPhone: dto.toPhone });
  }

  @Post('integrations/s3/test')
  @RequirePermissions('settings.manage')
  testS3Integration(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.integrations.testProvider(user.companyId, 's3', {});
  }

  @Post('integrations/anthropic/test')
  @RequirePermissions('settings.manage')
  testAnthropicIntegration(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.integrations.testProvider(user.companyId, 'anthropic', {});
  }

  @Get('integrations/links')
  getBusinessLinks(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.integrations.getBusinessLinks(user.companyId);
  }

  @Patch('integrations/links')
  @RequirePermissions('settings.manage')
  updateBusinessLinks(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: UpdateBusinessLinksDto) {
    return this.integrations.updateBusinessLinks(user.companyId, dto);
  }
}
