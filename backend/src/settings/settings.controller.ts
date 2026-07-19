import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { SettingsService } from './services/settings.service';
import {
  UpdateProfileDto,
  ChangePasswordDto,
  UpdateCompanyDto,
  UpdateBusinessDefaultsDto,
  UpdateBrandingDto,
  UpdatePaymentSettingsDto,
  UpdateEmailSettingsDto,
  SendTestEmailDto,
  SendTestSmsDto,
} from './dto/settings.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuthenticatedRequestUser } from '../auth/interfaces/jwt-payload.interface';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

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
}
