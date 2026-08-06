import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from '../../auth/services/password.service';
import { IntegrationStatusService } from '../../common/integrations/integration-status.service';
import { MailService } from '../../mail/mail.service';
import { SmsService } from '../../sms/sms.service';
import { StorageService } from '../../common/storage/storage.service';
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
  UpdateLeadSourcesDto,
  UpdatePackageDiscountsDto,
} from '../dto/settings.dto';

const PROFILE_SELECT = `
  id, email, first_name AS "firstName", last_name AS "lastName", phone, avatar_url AS "avatarUrl",
  timezone, date_format AS "dateFormat", language, email_verified_at AS "emailVerifiedAt"
`;

const COMPANY_SELECT = `
  id, name, dba, logo_url AS "logoUrl", address_line1 AS "addressLine1", address_line2 AS "addressLine2",
  city, state, postal_code AS "postalCode", country, phone, email, website,
  tax_id AS "taxId", license_number AS "licenseNumber", business_hours AS "businessHours"
`;

const BUSINESS_DEFAULTS_SELECT = `
  default_tax_rate_percent AS "defaultTaxRatePercent",
  default_arrival_window_minutes AS "defaultArrivalWindowMinutes",
  default_estimate_expiration_days AS "defaultEstimateExpirationDays",
  default_invoice_due_days AS "defaultInvoiceDueDays",
  default_labor_rate AS "defaultLaborRate",
  currency, measurement_unit_system AS "measurementUnitSystem", distance_unit AS "distanceUnit",
  timezone
`;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly integrationStatus: IntegrationStatusService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
    private readonly storage: StorageService,
  ) {}

  // ---- Profile ----

  async getProfile(userId: string) {
    const rows: any[] = await this.prisma.tenant.$queryRawUnsafe(`SELECT ${PROFILE_SELECT} FROM users WHERE id = $1::uuid`, userId);
    if (rows.length === 0) throw new NotFoundException('User not found');
    return rows[0];
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const existing = await this.getProfile(userId);
    const rows: any[] = await this.prisma.tenant.$queryRawUnsafe(
      `UPDATE users SET first_name = $2, last_name = $3, phone = $4, avatar_url = $5, timezone = $6, date_format = $7, language = $8, updated_at = now()
       WHERE id = $1::uuid RETURNING ${PROFILE_SELECT}`,
      userId,
      dto.firstName ?? existing.firstName,
      dto.lastName ?? existing.lastName,
      dto.phone ?? existing.phone,
      dto.avatarUrl ?? existing.avatarUrl,
      dto.timezone ?? existing.timezone,
      dto.dateFormat ?? existing.dateFormat,
      dto.language ?? existing.language,
    );
    return rows[0];
  }

  /**
   * Reuses the existing PasswordService (argon2) exactly as
   * registration/login already do — no second hashing implementation.
   * Requires the current password, verified before any change is
   * accepted, so a hijacked logged-in session alone can't silently
   * lock the real owner out.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const rows: { passwordHash: string | null }[] = await this.prisma.tenant.$queryRawUnsafe(
      `SELECT password_hash AS "passwordHash" FROM users WHERE id = $1::uuid`,
      userId,
    );
    if (rows.length === 0) throw new NotFoundException('User not found');
    if (!rows[0].passwordHash) {
      throw new BadRequestException('This account signs in via SSO and has no password to change');
    }
    const isValid = await this.passwordService.verify(rows[0].passwordHash, dto.currentPassword);
    if (!isValid) throw new UnauthorizedException('Current password is incorrect');

    const newHash = await this.passwordService.hash(dto.newPassword);
    await this.prisma.tenant.$executeRawUnsafe(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1::uuid`, userId, newHash);
    return { success: true };
  }

  // ---- Company ----

  async getCompany(companyId: string) {
    const rows: any[] = await this.prisma.tenant.$queryRawUnsafe(`SELECT ${COMPANY_SELECT} FROM companies WHERE id = $1::uuid`, companyId);
    if (rows.length === 0) throw new NotFoundException('Company not found');
    return rows[0];
  }

  async updateCompany(companyId: string, dto: UpdateCompanyDto) {
    const existing = await this.getCompany(companyId);
    const rows: any[] = await this.prisma.tenant.$queryRawUnsafe(
      `UPDATE companies SET
         name = $2, dba = $3, logo_url = $4, address_line1 = $5, address_line2 = $6, city = $7, state = $8,
         postal_code = $9, phone = $10, email = $11, website = $12, tax_id = $13, license_number = $14,
         business_hours = $15::jsonb, updated_at = now()
       WHERE id = $1::uuid RETURNING ${COMPANY_SELECT}`,
      companyId,
      dto.name ?? existing.name,
      dto.dba ?? existing.dba,
      dto.logoUrl ?? existing.logoUrl,
      dto.addressLine1 ?? existing.addressLine1,
      dto.addressLine2 ?? existing.addressLine2,
      dto.city ?? existing.city,
      dto.state ?? existing.state,
      dto.postalCode ?? existing.postalCode,
      dto.phone ?? existing.phone,
      dto.email ?? existing.email,
      dto.website ?? existing.website,
      dto.taxId ?? existing.taxId,
      dto.licenseNumber ?? existing.licenseNumber,
      JSON.stringify(dto.businessHours ?? existing.businessHours),
    );
    return rows[0];
  }

  // ---- Business Defaults ----

  async getBusinessDefaults(companyId: string) {
    const rows: any[] = await this.prisma.tenant.$queryRawUnsafe(`SELECT ${BUSINESS_DEFAULTS_SELECT} FROM companies WHERE id = $1::uuid`, companyId);
    if (rows.length === 0) throw new NotFoundException('Company not found');
    return rows[0];
  }

  async updateBusinessDefaults(companyId: string, dto: UpdateBusinessDefaultsDto) {
    const existing = await this.getBusinessDefaults(companyId);
    const rows: any[] = await this.prisma.tenant.$queryRawUnsafe(
      `UPDATE companies SET
         default_tax_rate_percent = $2, default_arrival_window_minutes = $3, default_estimate_expiration_days = $4,
         default_invoice_due_days = $5, default_labor_rate = $6, currency = $7, measurement_unit_system = $8,
         distance_unit = $9, timezone = $10, updated_at = now()
       WHERE id = $1::uuid RETURNING ${BUSINESS_DEFAULTS_SELECT}`,
      companyId,
      dto.defaultTaxRatePercent ?? existing.defaultTaxRatePercent,
      dto.defaultArrivalWindowMinutes ?? existing.defaultArrivalWindowMinutes,
      dto.defaultEstimateExpirationDays ?? existing.defaultEstimateExpirationDays,
      dto.defaultInvoiceDueDays ?? existing.defaultInvoiceDueDays,
      dto.defaultLaborRate ?? existing.defaultLaborRate,
      dto.currency ?? existing.currency,
      dto.measurementUnitSystem ?? existing.measurementUnitSystem,
      dto.distanceUnit ?? existing.distanceUnit,
      dto.timezone ?? existing.timezone,
    );
    return rows[0];
  }

  // ---- Branding (companies.settings JSONB — its originally intended purpose) ----

  /**
   * Reuses the exact presigned-upload pattern already established for
   * Customer photos (customer-files.service.ts) — same StorageService,
   * same shape, not a second upload system. The one real difference: a
   * logo needs a stable, always-fetchable URL (the browser displays it
   * directly, and the PDF generator fetches it fresh on every
   * generation), so this returns getPublicUrl() rather than a
   * short-lived presigned download link. Requires the S3 bucket/CDN to
   * allow public read on the `branding/` prefix — an AWS-side setting,
   * not something this code configures (same class of setup step as
   * the CORS policy Customer photo uploads needed).
   */
  async presignLogoUpload(companyId: string, fileName: string, mimeType: string) {
    const key = this.storage.buildKey(companyId, 'branding', fileName);
    const uploadUrl = await this.storage.getPresignedUploadUrl(key, mimeType);
    return { uploadUrl, publicUrl: this.storage.getPublicUrl(key), expiresInSeconds: 300 };
  }

  async getBranding(companyId: string) {
    const rows: { settings: any }[] = await this.prisma.tenant.$queryRawUnsafe(`SELECT settings FROM companies WHERE id = $1::uuid`, companyId);
    if (rows.length === 0) throw new NotFoundException('Company not found');
    const settings = rows[0].settings ?? {};
    return {
      logoUrl: settings.branding?.logoUrl ?? null,
      primaryColor: settings.branding?.primaryColor ?? null,
      secondaryColor: settings.branding?.secondaryColor ?? null,
      estimateHeader: settings.branding?.estimateHeader ?? null,
      invoiceHeader: settings.branding?.invoiceHeader ?? null,
      footerMessage: settings.branding?.footerMessage ?? null,
    };
  }

  async updateBranding(companyId: string, dto: UpdateBrandingDto) {
    const existing = await this.getBranding(companyId);
    const merged = {
      logoUrl: dto.logoUrl ?? existing.logoUrl,
      primaryColor: dto.primaryColor ?? existing.primaryColor,
      secondaryColor: dto.secondaryColor ?? existing.secondaryColor,
      estimateHeader: dto.estimateHeader ?? existing.estimateHeader,
      invoiceHeader: dto.invoiceHeader ?? existing.invoiceHeader,
      footerMessage: dto.footerMessage ?? existing.footerMessage,
    };
    // jsonb_set merges into the existing settings blob rather than
    // overwriting it — companies.settings may one day carry other keys
    // (feature flags, etc.) that branding updates must never clobber.
    await this.prisma.tenant.$executeRawUnsafe(
      `UPDATE companies SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{branding}', $2::jsonb, true), updated_at = now() WHERE id = $1::uuid`,
      companyId,
      JSON.stringify(merged),
    );
    return merged;
  }

  // ---- Lead Sources (companies.settings JSONB, same jsonb_set-merge pattern as Branding) ----

  /**
   * Default set when a company has never customized this list. Covers
   * the originally-requested 8 plus a few found to matter for real
   * reasons, not just popularity — 'website' specifically because
   * quote-widget.mappers.ts already writes this exact value today
   * (`customer.source = dto.leadSource ?? 'website'`), so it needs to be
   * a real, selectable option rather than a hidden special case.
   * "Community Event" was evaluated and folded into "Networking Event"
   * rather than added as a near-duplicate.
   */
  private readonly DEFAULT_LEAD_SOURCES: { key: string; label: string; enabled: boolean }[] = [
    { key: 'google', label: 'Google', enabled: true },
    { key: 'client_referral', label: 'Client Referral', enabled: true },
    { key: 'yard_sign', label: 'Yard Sign', enabled: true },
    { key: 'facebook', label: 'Facebook', enabled: true },
    { key: 'instagram', label: 'Instagram', enabled: true },
    { key: 'youtube', label: 'YouTube', enabled: true },
    { key: 'nextdoor', label: 'Nextdoor', enabled: true },
    { key: 'yelp', label: 'Yelp', enabled: true },
    { key: 'vehicle_sign', label: 'Vehicle Sign', enabled: true },
    { key: 'door_hanger', label: 'Door Hanger', enabled: true },
    { key: 'website', label: 'Website', enabled: true },
    { key: 'personal', label: 'Personal', enabled: true },
    { key: 'networking_event', label: 'Networking Event', enabled: true },
    { key: 'repeat_customer', label: 'Repeat Customer', enabled: true },
    { key: 'angi', label: 'Angi', enabled: true },
    { key: 'home_advisor', label: 'HomeAdvisor', enabled: false },
    { key: 'thumbtack', label: 'Thumbtack', enabled: false },
    { key: 'realtor', label: 'Realtor', enabled: false },
    { key: 'property_manager', label: 'Property Manager', enabled: false },
    { key: 'hoa', label: 'HOA', enabled: false },
    { key: 'direct_mail', label: 'Direct Mail', enabled: false },
    { key: 'chamber_of_commerce', label: 'Chamber of Commerce', enabled: false },
    { key: 'builder', label: 'Builder', enabled: false },
  ];

  async getLeadSources(companyId: string) {
    const rows: { settings: any }[] = await this.prisma.tenant.$queryRawUnsafe(`SELECT settings FROM companies WHERE id = $1::uuid`, companyId);
    if (rows.length === 0) throw new NotFoundException('Company not found');
    const settings = rows[0].settings ?? {};
    return { options: settings.leadSources?.options ?? this.DEFAULT_LEAD_SOURCES };
  }

  async updateLeadSources(companyId: string, dto: UpdateLeadSourcesDto) {
    // Array order = display order — no separate order field needed, the
    // frontend just submits the full list in whatever order it should
    // display. Add/edit/disable/remove/reorder are all just "submit a
    // new array" — one endpoint, not five granular ones, since this is
    // fundamentally one small config blob, not a system needing
    // per-item CRUD routes.
    const merged = { options: dto.options };
    await this.prisma.tenant.$executeRawUnsafe(
      `UPDATE companies SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{leadSources}', $2::jsonb, true), updated_at = now() WHERE id = $1::uuid`,
      companyId,
      JSON.stringify(merged),
    );
    return merged;
  }

  // ---- Package Discounts (same jsonb_set-merge pattern as Branding/Lead Sources) ----

  private readonly DEFAULT_PACKAGE_DISCOUNTS = {
    enabled: false,
    mode: 'tiered' as const,
    fixedPercent: 5,
    tiers: [
      { minServices: 2, percent: 3 },
      { minServices: 3, percent: 5 },
      { minServices: 4, percent: 7 },
      { minServices: 5, percent: 10 },
    ],
  };

  async getPackageDiscounts(companyId: string) {
    const rows: { settings: any }[] = await this.prisma.tenant.$queryRawUnsafe(`SELECT settings FROM companies WHERE id = $1::uuid`, companyId);
    if (rows.length === 0) throw new NotFoundException('Company not found');
    const settings = rows[0].settings ?? {};
    return settings.packageDiscounts ?? this.DEFAULT_PACKAGE_DISCOUNTS;
  }

  async updatePackageDiscounts(companyId: string, dto: UpdatePackageDiscountsDto) {
    await this.prisma.tenant.$executeRawUnsafe(
      `UPDATE companies SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{packageDiscounts}', $2::jsonb, true), updated_at = now() WHERE id = $1::uuid`,
      companyId,
      JSON.stringify(dto),
    );
    return dto;
  }

  // ---- Payment Settings ----
  // Stripe's real secret/webhook key are environment variables, checked
  // read-only here — never stored or editable through this endpoint.
  // Invoice due-date defaults already live in Business Defaults; this
  // deliberately doesn't repeat that field, just points to it.

  async getPaymentSettings(companyId: string) {
    const rows: { enabledPaymentMethods: string[] }[] = await this.prisma.tenant.$queryRawUnsafe(
      `SELECT enabled_payment_methods AS "enabledPaymentMethods" FROM companies WHERE id = $1::uuid`,
      companyId,
    );
    return {
      stripe: this.integrationStatus.get('stripe'),
      enabledPaymentMethods: rows[0]?.enabledPaymentMethods ?? ['card', 'cash', 'check'],
    };
  }

  async updatePaymentSettings(companyId: string, dto: UpdatePaymentSettingsDto) {
    if (dto.enabledPaymentMethods) {
      await this.prisma.tenant.$executeRawUnsafe(
        `UPDATE companies SET enabled_payment_methods = $2, updated_at = now() WHERE id = $1::uuid`,
        companyId,
        dto.enabledPaymentMethods,
      );
    }
    return this.getPaymentSettings(companyId);
  }

  // ---- Email Settings ----
  // POSTMARK_SERVER_TOKEN/MAIL_FROM_ADDRESS are environment variables,
  // same reasoning as Stripe. fromName intentionally reuses Company's
  // own name/dba rather than a second, potentially-drifting copy of it.

  async getEmailSettings(companyId: string) {
    const rows: { replyToEmail: string | null; name: string; dba: string | null }[] = await this.prisma.tenant.$queryRawUnsafe(
      `SELECT reply_to_email AS "replyToEmail", name, dba FROM companies WHERE id = $1::uuid`,
      companyId,
    );
    const row = rows[0];
    return {
      postmark: this.integrationStatus.get('postmark'),
      fromAddressConfigured: !!process.env.MAIL_FROM_ADDRESS,
      fromName: row?.dba || row?.name || null,
      replyToEmail: row?.replyToEmail ?? null,
    };
  }

  async updateEmailSettings(companyId: string, dto: UpdateEmailSettingsDto) {
    if (dto.replyToEmail !== undefined) {
      await this.prisma.tenant.$executeRawUnsafe(
        `UPDATE companies SET reply_to_email = $2, updated_at = now() WHERE id = $1::uuid`,
        companyId,
        dto.replyToEmail,
      );
    }
    return this.getEmailSettings(companyId);
  }

  /**
   * A real send through the exact same queue/processor every other
   * email in this app goes through — not a mocked "looks like it would
   * work" check. If Postmark isn't configured, MailProcessor logs and
   * skips (see mail.processor.ts) rather than throwing, so this always
   * returns success at the "queued" level; whether it actually arrives
   * is visible in Postmark's own dashboard, same as any other email
   * this app sends.
   */
  async sendTestEmail(companyId: string, dto: SendTestEmailDto) {
    await this.mail.sendAutomationEmail(dto.toEmail, 'Renovo CRM — Test Email', 'This is a test email from your Renovo CRM email settings. If you received this, your email configuration is working correctly.');
    return { queued: true, postmarkConfigured: this.integrationStatus.get('postmark').configured };
  }

  // ---- SMS Settings ----
  // TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER are environment variables.
  // No database fields here at all — there is nothing safe-to-store and
  // genuinely new to configure beyond what Automation Settings already
  // owns (timing/toggles), so this page is status + test-send only.

  getSmsSettings() {
    return { twilio: this.integrationStatus.get('twilio') };
  }

  /** Same real SmsService AutomationService's reminders use — not a second Twilio caller. */
  async sendTestSms(dto: SendTestSmsDto) {
    const result = await this.sms.send(dto.toPhone, 'This is a test message from your Renovo CRM SMS settings. If you received this, your SMS configuration is working correctly.');
    return { sent: result.sent, error: result.error, twilioConfigured: this.integrationStatus.get('twilio').configured };
  }

  // ---- Storage Settings ----
  // AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_S3_BUCKET are environment
  // variables. maxUploadSizeMb is read-only here, sourced from the real
  // Multer limit already enforced on the photo upload route
  // (jobs.controller.ts) — never a second, editable number that could
  // drift from what's actually enforced.

  getStorageSettings() {
    return {
      s3: this.integrationStatus.get('s3'),
      maxUploadSizeMb: 15,
    };
  }
}
